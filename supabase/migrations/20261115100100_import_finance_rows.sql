-- SD-420 (2/2): import manual income and expenses into the finance ledger from a CSV (owner only, atomic, idempotent).
-- Rollback: drop function public.import_finance_rows(uuid, jsonb, numeric);
--   delete from public.finance_entries where source = 'csv_import';  (only if the data must go too)
--
-- Each row: ref (content hash made by the app, 16-64 hex chars), kind income|expense, category (free text matched to the
-- org's categories of that kind by name, ignoring case and spaces; no match -> the built-in "Otros ingresos/egresos"),
-- occurred_on, amount_cents, currency, optional unit_id / payment_method / counterparty / note.
-- Idempotency: unique (org_id, source, external_ref) with external_ref = 'csv:' || ref, so re-importing the same file adds nothing.
-- Rental income with stays is NOT imported here (Airbnb CSV and iCal cover it). Dates in the future are rejected.
-- created_by stays null (system movement). Errors: 42501 not allowed / unit not in org · 22023 invalid input.

create function public.import_finance_rows(p_org_id uuid, p_rows jsonb, p_fx_rate_pen numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_cat uuid;
  v_fallback uuid;
  v_unc boolean;
  v_today date := (now() at time zone 'America/Lima')::date;
  v_inserted int := 0;
  v_duplicates int := 0;
  v_uncategorized int := 0;
  v_new uuid;
begin
  if p_org_id is null or not coalesce(private.is_owner(p_org_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 5000 then
    raise exception 'invalid rows' using errcode = '22023';
  end if;
  if p_fx_rate_pen is not null and (p_fx_rate_pen <= 0 or p_fx_rate_pen >= 100) then
    raise exception 'invalid exchange rate' using errcode = '22023';
  end if;

  perform private.seed_finance_categories(p_org_id);

  for r in
    select * from jsonb_to_recordset(p_rows) as x(
      ref text, kind text, category text, occurred_on date, amount_cents bigint, currency text,
      unit_id uuid, payment_method text, counterparty text, note text)
  loop
    if r.ref is null or r.ref !~ '^[0-9a-f]{16,64}$'
       or r.kind is null or r.kind not in ('income', 'expense')
       or r.occurred_on is null or r.occurred_on > v_today or r.occurred_on < date '2000-01-01'
       or r.currency is null or r.currency not in ('PEN', 'USD')
       or r.amount_cents is null or r.amount_cents <= 0 or r.amount_cents > 2000000000
       or (r.payment_method is not null and r.payment_method not in ('cash', 'bank_transfer', 'yape_plin', 'card', 'platform', 'other'))
       or (r.counterparty is not null and char_length(btrim(r.counterparty)) > 200)
       or (r.note is not null and char_length(btrim(r.note)) > 1000) then
      raise exception 'invalid row' using errcode = '22023';
    end if;
    if r.currency = 'USD' and p_fx_rate_pen is null then
      raise exception 'exchange rate required' using errcode = '22023';
    end if;
    if r.unit_id is not null and not exists (select 1 from public.units u where u.id = r.unit_id and u.org_id = p_org_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;

    -- Category by name among the org's non-archived categories of that kind (never "Alquiler" / commission: those have
    -- their own flows); otherwise the built-in catch-all.
    v_cat := null;
    v_unc := false;
    if r.category is not null and btrim(r.category) <> '' then
      select c.id into v_cat from public.finance_categories c
       where c.org_id = p_org_id and c.kind = r.kind::public.finance_kind and not c.archived
         and coalesce(c.system_key, '') not in ('rental', 'platform_commission')
         and lower(btrim(c.name)) = lower(btrim(r.category))
       order by c.sort_order limit 1;
    end if;
    if v_cat is null then
      select c.id into v_fallback from public.finance_categories c
       where c.org_id = p_org_id and c.system_key = case when r.kind = 'income' then 'other_income' else 'other_expense' end;
      if v_fallback is null then
        raise exception 'category missing' using errcode = '55000';
      end if;
      v_cat := v_fallback;
      v_unc := true;
    end if;

    v_new := null;
    insert into public.finance_entries (
      org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id, payment_method,
      counterparty, note, created_by, source, external_ref
    ) values (
      p_org_id, r.kind::public.finance_kind, v_cat, r.occurred_on, r.amount_cents::integer, r.currency::public.currency_code,
      case when r.currency = 'USD' then p_fx_rate_pen end, r.unit_id, r.payment_method::public.finance_payment_method,
      nullif(btrim(r.counterparty), ''), nullif(btrim(r.note), ''), null, 'csv_import', 'csv:' || r.ref
    ) on conflict (org_id, source, external_ref) where external_ref is not null do nothing
    returning id into v_new;

    if v_new is null then
      v_duplicates := v_duplicates + 1;
    else
      v_inserted := v_inserted + 1;
      if v_unc then v_uncategorized := v_uncategorized + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_duplicates, 'uncategorized', v_uncategorized);
end;
$$;

revoke all on function public.import_finance_rows(uuid, jsonb, numeric) from public, anon;
grant execute on function public.import_finance_rows(uuid, jsonb, numeric) to authenticated;
