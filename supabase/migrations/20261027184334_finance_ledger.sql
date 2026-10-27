-- SD-801: income/expense ledger (ADR 0007). Additive migration.
-- Rollback (destroys ledger data, export first):
--   drop table public.finance_entries; drop table public.finance_categories;
--   drop function private.seed_finance_categories(uuid), private.seed_finance_categories_trigger(),
--     private.touch_finance_updated_at(), private.is_owner(uuid);
--   drop type public.finance_kind, public.finance_channel, public.finance_payment_method, public.finance_source;
--   drop table public.finance_unit_settings; drop function private.finance_default_categories(), private.finance_entries_related_guard();
--   delete from storage.objects where bucket_id = 'finance-receipts';
--   delete from storage.buckets where id = 'finance-receipts'; (+ the finance_receipts_* policies)

create type public.finance_kind as enum ('income', 'expense');
create type public.finance_channel as enum ('direct', 'airbnb', 'booking', 'other');
create type public.finance_payment_method as enum ('cash', 'bank_transfer', 'yape_plin', 'card', 'platform', 'other');
create type public.finance_source as enum ('manual', 'booking', 'ical');

-- ─── Roles ──────────────────────────────────────────────────────────────────
-- Same shape as private.is_member: security definer + empty search_path so a
-- caller cannot shadow public.memberships or auth.uid().
create function private.is_owner(target_org_id uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where memberships.org_id = target_org_id
      and memberships.user_id = auth.uid()
      and memberships.role = 'owner'
  );
$$;
revoke all on function private.is_owner(uuid) from public, anon;
grant execute on function private.is_owner(uuid) to authenticated;

-- Suggested cleaning cost per unit, in the property's currency. Kept OUT of
-- public.units on purpose: that table is readable by anon (public site), so a
-- column there would expose an internal cost. Members read it (to prefill a
-- rental's cleaning); only the owner changes it.
create function private.touch_finance_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_finance_updated_at() from public, anon, authenticated;

create table public.finance_unit_settings (
  unit_id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  cleaning_cost_cents integer check (cleaning_cost_cents is null or cleaning_cost_cents >= 0),
  updated_at timestamptz not null default now(),
  constraint finance_unit_settings_unit_fkey foreign key (unit_id, org_id)
    references public.units (id, org_id) on delete cascade
);
create index finance_unit_settings_org_id_idx on public.finance_unit_settings(org_id);
create trigger finance_unit_settings_updated_at before update on public.finance_unit_settings
  for each row execute function private.touch_finance_updated_at();

alter table public.finance_unit_settings enable row level security;
create policy finance_unit_settings_select on public.finance_unit_settings for select to authenticated
  using (private.is_member(org_id));
create policy finance_unit_settings_insert on public.finance_unit_settings for insert to authenticated
  with check (private.is_owner(org_id));
create policy finance_unit_settings_update on public.finance_unit_settings for update to authenticated
  using (private.is_owner(org_id)) with check (private.is_owner(org_id));
create policy finance_unit_settings_delete on public.finance_unit_settings for delete to authenticated
  using (private.is_owner(org_id));
revoke all on public.finance_unit_settings from public, anon, authenticated;
grant select on public.finance_unit_settings to authenticated;
grant insert (unit_id, org_id, cleaning_cost_cents) on public.finance_unit_settings to authenticated;
grant update (cleaning_cost_cents) on public.finance_unit_settings to authenticated;
grant delete on public.finance_unit_settings to authenticated;
grant all on public.finance_unit_settings to service_role;

-- ─── Categories ─────────────────────────────────────────────────────────────
create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.finance_kind not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Stable key of the built-in categories (reports and automatic loads look
  -- them up by key, so renaming one never breaks them). Null = user-created.
  system_key text check (system_key is null or system_key ~ '^[a-z_]{1,40}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  constraint finance_categories_id_org_key unique (id, org_id),
  -- Target of finance_entries' composite FK: pins an entry's org AND kind.
  constraint finance_categories_id_org_kind_key unique (id, org_id, kind)
);
create unique index finance_categories_name_key
  on public.finance_categories (org_id, kind, lower(btrim(name)));
create unique index finance_categories_system_key_key
  on public.finance_categories (org_id, system_key) where system_key is not null;
create index finance_categories_org_id_idx on public.finance_categories(org_id);

alter table public.finance_categories enable row level security;
-- Every member needs the list to register an entry; only owners shape it.
create policy finance_categories_select on public.finance_categories for select to authenticated
  using (private.is_member(org_id));
create policy finance_categories_insert on public.finance_categories for insert to authenticated
  with check (private.is_owner(org_id));
create policy finance_categories_update on public.finance_categories for update to authenticated
  using (private.is_owner(org_id)) with check (private.is_owner(org_id));
-- Built-in categories (system_key) can be renamed or archived, never deleted:
-- reports and automatic loads find them by key and the seed does not re-run.
create policy finance_categories_delete on public.finance_categories for delete to authenticated
  using (private.is_owner(org_id) and system_key is null);

revoke all on public.finance_categories from public, anon, authenticated;
grant select on public.finance_categories to authenticated;
grant insert (org_id, kind, name, sort_order) on public.finance_categories to authenticated;
grant update (name, sort_order, archived) on public.finance_categories to authenticated;
grant delete on public.finance_categories to authenticated;
grant all on public.finance_categories to service_role;

-- Built-in categories.
create function private.finance_default_categories()
returns table (kind public.finance_kind, name text, system_key text, sort_order integer)
language sql immutable set search_path = '' as $$
  select d.kind::public.finance_kind, d.name, d.system_key, d.sort_order
  from (values
    ('income',  'Alquiler',                 'rental',              0),
    ('income',  'Servicios extra',          'extra_services',      1),
    ('income',  'Otros ingresos',           'other_income',        2),
    ('expense', 'Limpieza',                 'cleaning',            0),
    ('expense', 'Mantenimiento',            'maintenance',         1),
    ('expense', 'Agua',                     'water',               2),
    ('expense', 'Luz',                      'electricity',         3),
    ('expense', 'Internet',                 'internet',            4),
    ('expense', 'Gas',                      'gas',                 5),
    ('expense', 'Insumos',                  'supplies',            6),
    ('expense', 'Lavandería',               'laundry',             7),
    ('expense', 'Comisiones de plataforma', 'platform_commission', 8),
    ('expense', 'Impuestos y arbitrios',    'taxes',               9),
    ('expense', 'Personal',                 'payroll',            10),
    ('expense', 'Otros egresos',            'other_expense',      11)
  ) as d(kind, name, system_key, sort_order);
$$;
revoke all on function private.finance_default_categories() from public, anon, authenticated;

-- Idempotent: safe to call again for any org. A user category that already has
-- a built-in's name (same kind, ignoring case/spaces) is adopted as that
-- built-in instead of blocking it through the unique-name index.
create function private.seed_finance_categories(target_org_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.finance_categories c
     set system_key = d.system_key
    from private.finance_default_categories() d
   where c.org_id = target_org_id and c.system_key is null
     and c.kind = d.kind and lower(btrim(c.name)) = lower(btrim(d.name))
     and not exists (
       select 1 from public.finance_categories x where x.org_id = target_org_id and x.system_key = d.system_key
     );
  insert into public.finance_categories (org_id, kind, name, system_key, sort_order)
  select target_org_id, d.kind, d.name, d.system_key, d.sort_order
  from private.finance_default_categories() d
  on conflict do nothing;
$$;
revoke all on function private.seed_finance_categories(uuid) from public, anon, authenticated;

create function private.seed_finance_categories_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.seed_finance_categories(new.id);
  return new;
end;
$$;
revoke all on function private.seed_finance_categories_trigger() from public, anon, authenticated;
create trigger organizations_seed_finance_categories after insert on public.organizations
  for each row execute function private.seed_finance_categories_trigger();

select private.seed_finance_categories(id) from public.organizations;

-- ─── Entries ────────────────────────────────────────────────────────────────
create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.finance_kind not null,
  category_id uuid not null,
  -- Cash basis date: when the money was received / paid (America/Lima civil date).
  occurred_on date not null,
  amount_cents integer not null,
  currency public.currency_code not null,
  -- PEN per 1 unit of `currency`; required for foreign currencies, null for PEN.
  fx_rate_pen numeric(12, 6),
  -- Exact half-up rounding, computed once by the database so every report and
  -- the Excel export read the same figure.
  amount_pen_cents bigint generated always as (
    case when currency = 'PEN' then amount_cents::bigint
         else round(amount_cents::numeric * fx_rate_pen)::bigint end
  ) stored,
  -- null = general expense (not tied to one house). Restrict: a unit with
  -- financial history is deactivated, never deleted, so past figures keep meaning.
  unit_id uuid,
  payment_method public.finance_payment_method,
  counterparty text,
  note text,
  -- Rental income only: stay [stay_start, stay_end), channel, guests.
  stay_start date,
  stay_end date,
  channel public.finance_channel,
  guests integer,
  -- Cleaning / maintenance / commission linked to the rental that caused them.
  -- Deleting the rental keeps the costs (they were paid) as unlinked expenses.
  related_entry_id uuid,
  -- Path inside the private finance-receipts bucket ({org_id}/...).
  receipt_path text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  source public.finance_source not null default 'manual',
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint finance_entries_id_org_key unique (id, org_id),
  constraint finance_entries_category_fkey foreign key (category_id, org_id, kind)
    references public.finance_categories (id, org_id, kind),
  constraint finance_entries_unit_fkey foreign key (unit_id, org_id)
    references public.units (id, org_id) on delete restrict,
  constraint finance_entries_related_fkey foreign key (related_entry_id, org_id)
    references public.finance_entries (id, org_id) on delete set null (related_entry_id),

  constraint finance_entries_amount_check check (amount_cents > 0),
  constraint finance_entries_fx_check check (
    (currency = 'PEN' and fx_rate_pen is null)
    or (currency <> 'PEN' and fx_rate_pen is not null and fx_rate_pen > 0 and fx_rate_pen < 100)
  ),
  constraint finance_entries_counterparty_check
    check (counterparty is null or char_length(btrim(counterparty)) between 1 and 200),
  constraint finance_entries_note_check
    check (note is null or char_length(btrim(note)) between 1 and 1000),
  constraint finance_entries_stay_check check (
    (stay_start is null) = (stay_end is null)
    and (stay_start is null or (kind = 'income' and stay_end > stay_start))
  ),
  constraint finance_entries_channel_check check (channel is null or kind = 'income'),
  constraint finance_entries_guests_check
    check (guests is null or (stay_start is not null and guests between 1 and 1000)),
  constraint finance_entries_related_self_check check (related_entry_id is null or related_entry_id <> id),
  constraint finance_entries_receipt_check check (
    receipt_path is null or (
      char_length(receipt_path) <= 500
      and receipt_path like org_id::text || '/%'
      and receipt_path !~ '(^|/)\.\.(/|$)'
    )
  ),
  constraint finance_entries_external_check check (
    (source = 'manual') = (external_ref is null)
    and (external_ref is null or char_length(external_ref) between 1 and 200)
  )
);

create unique index finance_entries_external_key
  on public.finance_entries (org_id, source, external_ref) where external_ref is not null;
create index finance_entries_org_date_idx on public.finance_entries (org_id, occurred_on);
create index finance_entries_unit_idx on public.finance_entries (org_id, unit_id) where unit_id is not null;
create index finance_entries_category_idx on public.finance_entries (org_id, category_id);
create index finance_entries_related_idx on public.finance_entries (related_entry_id) where related_entry_id is not null;
create index finance_entries_stay_idx on public.finance_entries (org_id, stay_start) where stay_start is not null;
create index finance_entries_created_by_idx on public.finance_entries (org_id, created_by);

create trigger finance_entries_updated_at before update on public.finance_entries
  for each row execute function private.touch_finance_updated_at();

alter table public.finance_entries enable row level security;
-- Owner: everything in the org. Staff: register entries and only ever see /
-- touch their own (created_by defaults to auth.uid() and cannot be set).
-- A staff member may only link a cost to an entry they can already see (FK
-- checks bypass RLS, so without this they could attach costs to a rental they
-- cannot read). It runs as the caller, so the lookup obeys RLS, and only when
-- the link is new or changed: an owner linking a staff entry to a rental the
-- staff cannot see does not stop that staff member from editing other fields.
create function private.finance_entries_related_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.related_entry_id is not null
     and (tg_op = 'INSERT' or new.related_entry_id is distinct from old.related_entry_id)
     and not private.is_owner(new.org_id)
     and not exists (
       select 1 from public.finance_entries r where r.id = new.related_entry_id and r.org_id = new.org_id
     ) then
    raise exception 'related entry not found' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.finance_entries_related_guard() from public, anon, authenticated;
create trigger finance_entries_related_guard before insert or update on public.finance_entries
  for each row execute function private.finance_entries_related_guard();

create policy finance_entries_select on public.finance_entries for select to authenticated
  using (private.is_owner(org_id) or (private.is_member(org_id) and created_by = auth.uid()));
create policy finance_entries_insert on public.finance_entries for insert to authenticated
  with check (
    private.is_member(org_id)
    and (private.is_owner(org_id) or created_by = auth.uid())
  );
create policy finance_entries_update on public.finance_entries for update to authenticated
  using (private.is_owner(org_id) or (private.is_member(org_id) and created_by = auth.uid()))
  with check (
    (private.is_owner(org_id) or (private.is_member(org_id) and created_by = auth.uid()))
  );
create policy finance_entries_delete on public.finance_entries for delete to authenticated
  using (private.is_owner(org_id) or (private.is_member(org_id) and created_by = auth.uid()));

-- No anon access. created_by/source/external_ref are not writable by users:
-- the first comes from the session, the other two only from trusted loaders
-- (service role, SD-807) so idempotency keys cannot be forged or collided.
revoke all on public.finance_entries from public, anon, authenticated;
grant select on public.finance_entries to authenticated;
grant insert (
  org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id, payment_method,
  counterparty, note, stay_start, stay_end, channel, guests, related_entry_id, receipt_path
) on public.finance_entries to authenticated;
grant update (
  category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id, payment_method,
  counterparty, note, stay_start, stay_end, channel, guests, related_entry_id, receipt_path
) on public.finance_entries to authenticated;
grant delete on public.finance_entries to authenticated;
grant all on public.finance_entries to service_role;
grant usage on type public.finance_kind, public.finance_channel,
  public.finance_payment_method, public.finance_source to anon, authenticated, service_role;

-- ─── Private receipts bucket ────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finance-receipts', 'finance-receipts', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Uploads under the caller's own org prefix; reads/deletes only by the owner
-- or by the member who uploaded the object. Nothing is public. private.
-- storage_path_org (SD-202) returns null for any path without a uuid first segment.
create policy finance_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-receipts' and private.is_member(private.storage_path_org(name)));
create policy finance_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'finance-receipts' and (
    private.is_owner(private.storage_path_org(name))
    or (private.is_member(private.storage_path_org(name)) and owner_id = auth.uid()::text)
  ));
create policy finance_receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'finance-receipts' and private.is_owner(private.storage_path_org(name)))
  with check (bucket_id = 'finance-receipts' and private.is_owner(private.storage_path_org(name)));
create policy finance_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'finance-receipts' and (
    private.is_owner(private.storage_path_org(name))
    or (private.is_member(private.storage_path_org(name)) and owner_id = auth.uid()::text)
  ));
