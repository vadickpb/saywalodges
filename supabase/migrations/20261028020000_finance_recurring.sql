-- SD-806: recurring expenses (water, electricity, internet...). A template says
-- "this costs about X on day D of every month"; each month it shows as PENDING and
-- the owner confirms it with the real amount, which writes a normal expense.
-- No cron: pending items are computed when the page is read. Additive migration.
-- Rollback: drop function public.confirm_recurring_expense(uuid, uuid, date, integer, public.currency_code,
--   numeric, date); drop table public.finance_recurring_runs; drop table public.finance_recurring;
--
-- Owner-only end to end (the templates, the pending list and the confirmation).
-- Idempotency lives in finance_recurring_runs: one row per (template, month), so
-- confirming the same pending item twice - double click, two tabs - returns the
-- first expense instead of writing another one.

create table public.finance_recurring (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  kind public.finance_kind not null default 'expense' check (kind = 'expense'),
  category_id uuid not null,
  -- null = general expense (not tied to one house).
  unit_id uuid,
  -- 1..28 so the day exists in every month.
  day_of_month smallint not null check (day_of_month between 1 and 28),
  estimated_cents integer not null check (estimated_cents > 0),
  currency public.currency_code not null,
  counterparty text check (counterparty is null or char_length(btrim(counterparty)) between 1 and 200),
  payment_method public.finance_payment_method,
  active boolean not null default true,
  -- First month it applies (first day of the month, America/Lima).
  starts_month date not null default (date_trunc('month', now() at time zone 'America/Lima'))::date
    check (extract(day from starts_month) = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_recurring_id_org_key unique (id, org_id),
  constraint finance_recurring_category_fkey foreign key (category_id, org_id, kind)
    references public.finance_categories (id, org_id, kind),
  constraint finance_recurring_unit_fkey foreign key (unit_id, org_id)
    references public.units (id, org_id) on delete cascade
);
create index finance_recurring_org_id_idx on public.finance_recurring (org_id);
create index finance_recurring_category_idx on public.finance_recurring (org_id, category_id);
create index finance_recurring_unit_idx on public.finance_recurring (org_id, unit_id) where unit_id is not null;

create trigger finance_recurring_updated_at before update on public.finance_recurring
  for each row execute function private.touch_finance_updated_at();

alter table public.finance_recurring enable row level security;
create policy finance_recurring_select on public.finance_recurring for select to authenticated
  using (private.is_owner(org_id));
create policy finance_recurring_insert on public.finance_recurring for insert to authenticated
  with check (private.is_owner(org_id));
create policy finance_recurring_update on public.finance_recurring for update to authenticated
  using (private.is_owner(org_id)) with check (private.is_owner(org_id));
create policy finance_recurring_delete on public.finance_recurring for delete to authenticated
  using (private.is_owner(org_id));

revoke all on public.finance_recurring from public, anon, authenticated;
grant select on public.finance_recurring to authenticated;
grant insert (
  org_id, name, category_id, unit_id, day_of_month, estimated_cents, currency, counterparty, payment_method, active, starts_month
) on public.finance_recurring to authenticated;
grant update (
  name, category_id, unit_id, day_of_month, estimated_cents, currency, counterparty, payment_method, active
) on public.finance_recurring to authenticated;
grant delete on public.finance_recurring to authenticated;
grant all on public.finance_recurring to service_role;

-- ─── Confirmations: one row per (template, month) ───────────────────────────
create table public.finance_recurring_runs (
  recurring_id uuid not null,
  org_id uuid not null,
  month date not null check (extract(day from month) = 1),
  entry_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (recurring_id, month),
  constraint finance_recurring_runs_entry_key unique (entry_id),
  constraint finance_recurring_runs_recurring_fkey foreign key (recurring_id, org_id)
    references public.finance_recurring (id, org_id) on delete cascade,
  -- Deleting the confirmed expense makes that month pending again.
  constraint finance_recurring_runs_entry_fkey foreign key (entry_id, org_id)
    references public.finance_entries (id, org_id) on delete cascade
);
create index finance_recurring_runs_org_month_idx on public.finance_recurring_runs (org_id, month);

alter table public.finance_recurring_runs enable row level security;
create policy finance_recurring_runs_select on public.finance_recurring_runs for select to authenticated
  using (private.is_owner(org_id));
create policy finance_recurring_runs_insert on public.finance_recurring_runs for insert to authenticated
  with check (private.is_owner(org_id));

revoke all on public.finance_recurring_runs from public, anon, authenticated;
grant select on public.finance_recurring_runs to authenticated;
grant insert (recurring_id, org_id, month, entry_id) on public.finance_recurring_runs to authenticated;
grant all on public.finance_recurring_runs to service_role;

-- ─── Confirm one month ──────────────────────────────────────────────────────
-- SECURITY INVOKER: RLS and the column grants decide who may do it (the owner of
-- the template's org; anyone else cannot even see the template). p_org_id is the
-- session's org and must own the template. The template row is locked FOR UPDATE,
-- so two simultaneous confirmations of the same month queue up and the second
-- one finds the first one's run.
create function public.confirm_recurring_expense(
  p_org_id uuid,
  p_recurring_id uuid,
  p_month date,
  p_amount_cents integer,
  p_currency public.currency_code,
  p_fx_rate_pen numeric default null,
  p_occurred_on date default null
)
returns table (out_entry_id uuid, out_created boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_t public.finance_recurring%rowtype;
  v_existing uuid;
  v_on date;
  v_new uuid;
begin
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'invalid month' using errcode = '22023';
  end if;

  select * into v_t from public.finance_recurring r
   where r.id = p_recurring_id and r.org_id = p_org_id
   for update;
  if not found then
    raise exception 'recurring expense not found' using errcode = '42501';
  end if;
  if p_month < v_t.starts_month then
    raise exception 'month before the start of the template' using errcode = '22023';
  end if;
  -- The page never offers these, but the function is callable directly: a paused
  -- template and a month that has not begun (America/Lima) are refused here too.
  if not v_t.active then
    raise exception 'recurring expense is paused' using errcode = '22023';
  end if;
  -- The template fixes the currency; only the amount and the rate change per month.
  if p_currency <> v_t.currency then
    raise exception 'currency differs from the template' using errcode = '22023';
  end if;
  if p_month > (date_trunc('month', now() at time zone 'America/Lima'))::date then
    raise exception 'month has not begun' using errcode = '22023';
  end if;

  select run.entry_id into v_existing from public.finance_recurring_runs run
   where run.recurring_id = v_t.id and run.month = p_month;
  if v_existing is not null then
    return query select v_existing, false;
    return;
  end if;

  v_on := coalesce(p_occurred_on, p_month + (v_t.day_of_month - 1));
  if v_on < p_month or v_on >= (p_month + interval '1 month')::date then
    raise exception 'date outside the month' using errcode = '22023';
  end if;

  insert into public.finance_entries (
    org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id,
    payment_method, counterparty, note
  ) values (
    v_t.org_id, 'expense', v_t.category_id, v_on, p_amount_cents, p_currency, p_fx_rate_pen, v_t.unit_id,
    v_t.payment_method, v_t.counterparty, v_t.name
  ) returning id into v_new;

  insert into public.finance_recurring_runs (recurring_id, org_id, month, entry_id)
  values (v_t.id, v_t.org_id, p_month, v_new);

  return query select v_new, true;
end;
$$;

revoke all on function public.confirm_recurring_expense(uuid, uuid, date, integer, public.currency_code, numeric, date)
  from public, anon;
grant execute on function public.confirm_recurring_expense(uuid, uuid, date, integer, public.currency_code, numeric, date)
  to authenticated, service_role;
