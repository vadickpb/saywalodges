-- SD-419b: Airbnb history is recorded NET (what actually reached the bank). The platform commission never
-- entered the owner's accounts, so it is NOT an expense: the income is gross - commission and the note keeps
-- the breakdown. Existing airbnb_csv rows are converted in place (income reduced by its linked commission,
-- commission row deleted); no re-import needed. Idempotent: re-running changes nothing.
-- Rollback: restore the previous function from 20261106100100_import_airbnb_history.sql; converted rows would
--   have to be re-imported (gross is in the note).

update public.finance_entries i
   set amount_cents = i.amount_cents - f.amount_cents,
       note = 'Bruto ' || (i.amount_cents / 100.0)::numeric(14,2)::text
              || ' · Comisión Airbnb ' || (f.amount_cents / 100.0)::numeric(14,2)::text || ' ' || i.currency::text
  from public.finance_entries f
 where f.source = 'airbnb_csv' and f.kind = 'expense' and f.external_ref like 'airbnb:%:fee'
   and f.related_entry_id = i.id and f.org_id = i.org_id and f.currency = i.currency
   and i.source = 'airbnb_csv' and i.kind = 'income' and i.amount_cents > f.amount_cents;

delete from public.finance_entries f
 using public.finance_entries i
 where f.source = 'airbnb_csv' and f.kind = 'expense' and f.external_ref like 'airbnb:%:fee'
   and i.id = f.related_entry_id and i.org_id = f.org_id and i.note like 'Bruto %· Comisión Airbnb %';

create or replace function public.import_airbnb_history(p_org_id uuid, p_rows jsonb, p_fx_rate_pen numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_rental uuid;
  v_income_cat uuid;
  v_today date := (now() at time zone 'America/Lima')::date;
  v_inserted int := 0;
  v_duplicates int := 0;
  v_future int := 0;
  v_overlap int := 0;
  v_fee_count int := 0;
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
  select c.id into v_income_cat from public.finance_categories c where c.org_id = p_org_id and c.system_key = 'rental';
  if v_income_cat is null then
    raise exception 'category missing' using errcode = '55000';
  end if;

  for r in
    select * from jsonb_to_recordset(p_rows) as x(
      ref text, unit_id uuid, stay_start date, stay_end date, occurred_on date,
      guest text, guests integer, currency text, gross_cents bigint, fee_cents bigint)
  loop
    if r.ref is null or r.ref !~ '^[A-Za-z0-9]{6,30}$'
       or r.unit_id is null or r.stay_start is null or r.stay_end is null or r.stay_end <= r.stay_start
       or r.occurred_on is null or r.currency is null or r.currency not in ('PEN', 'USD')
       or r.gross_cents is null or r.gross_cents <= 0 or r.gross_cents > 2000000000
       or coalesce(r.fee_cents, 0) < 0 or coalesce(r.fee_cents, 0) >= r.gross_cents
       or (r.guests is not null and r.guests not between 1 and 1000) then
      raise exception 'invalid row' using errcode = '22023';
    end if;
    if r.currency = 'USD' and p_fx_rate_pen is null then
      raise exception 'exchange rate required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.units u where u.id = r.unit_id and u.org_id = p_org_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if r.stay_end > v_today then
      v_future := v_future + 1;
      continue;
    end if;

    -- Same unit + same stay + channel airbnb already in the ledger from another source (typed by hand or
    -- completed from iCal): skip, so the stay is never counted twice.
    if exists (select 1 from public.finance_entries e
                where e.org_id = p_org_id and e.kind = 'income' and e.unit_id = r.unit_id
                  and e.stay_start = r.stay_start and e.stay_end = r.stay_end and e.channel = 'airbnb'
                  and e.external_ref is distinct from 'airbnb:' || r.ref) then
      v_overlap := v_overlap + 1;
      continue;
    end if;

    v_rental := null;
    insert into public.finance_entries (
      org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id, payment_method,
      counterparty, note, stay_start, stay_end, channel, guests, created_by, source, external_ref
    ) values (
      p_org_id, 'income', v_income_cat, r.occurred_on, (r.gross_cents - coalesce(r.fee_cents, 0))::integer, r.currency::public.currency_code,
      case when r.currency = 'USD' then p_fx_rate_pen end, r.unit_id, 'platform',
      nullif(left(btrim(r.guest), 200), ''),
      case when coalesce(r.fee_cents, 0) > 0 then 'Bruto ' || (r.gross_cents / 100.0)::numeric(14,2)::text
        || ' · Comisión Airbnb ' || (r.fee_cents / 100.0)::numeric(14,2)::text || ' ' || r.currency end,
      r.stay_start, r.stay_end, 'airbnb', r.guests, null,
      'airbnb_csv', 'airbnb:' || r.ref
    ) on conflict (org_id, source, external_ref) where external_ref is not null do nothing
    returning id into v_rental;

    if v_rental is null then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;
    v_inserted := v_inserted + 1;

    if coalesce(r.fee_cents, 0) > 0 then v_fee_count := v_fee_count + 1; end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_duplicates,
    'skipped_future', v_future, 'skipped_overlap', v_overlap, 'commissions', v_fee_count);
end;
$$;

revoke all on function public.import_airbnb_history(uuid, jsonb, numeric) from public, anon;
grant execute on function public.import_airbnb_history(uuid, jsonb, numeric) to authenticated;
