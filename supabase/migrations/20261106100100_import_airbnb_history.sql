-- SD-419 (2/2): import past Airbnb stays into the finance ledger (owner only, atomic, idempotent).
-- Rollback: drop function public.import_airbnb_history(uuid, jsonb, numeric);
--   delete from public.finance_entries where source = 'airbnb_csv';  (only if the data must go too)
--
-- Why the ledger and not bookings: historical stays have no quote, no guest e-mail and would fire booking
-- e-mails and hit the calendar exclusion constraint. finance_entries already carries stay dates, channel,
-- guest name and the commission link, and reports compute income/occupancy from them.
--
-- Each row = gross income (category rental, channel airbnb) + optional platform commission linked to it.
-- Idempotency: unique (org_id, source, external_ref): 'airbnb:<code>' and 'airbnb:<code>:fee'.
-- A stay already recorded for the same unit and dates on channel airbnb (by hand or from iCal) is skipped.
-- Stays not finished yet (stay_end after today in Lima) are skipped: iCal covers the upcoming ones.
-- created_by stays null (system movement), like confirm_payment.
-- Errors: 42501 not allowed / unit not in org · 22023 invalid input.

create function public.import_airbnb_history(p_org_id uuid, p_rows jsonb, p_fx_rate_pen numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_rental uuid;
  v_fee uuid;
  v_income_cat uuid;
  v_fee_cat uuid;
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
  select c.id into v_fee_cat from public.finance_categories c where c.org_id = p_org_id and c.system_key = 'platform_commission';
  if v_income_cat is null or v_fee_cat is null then
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
       or coalesce(r.fee_cents, 0) < 0 or coalesce(r.fee_cents, 0) > 2000000000
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
      counterparty, stay_start, stay_end, channel, guests, created_by, source, external_ref
    ) values (
      p_org_id, 'income', v_income_cat, r.occurred_on, r.gross_cents::integer, r.currency::public.currency_code,
      case when r.currency = 'USD' then p_fx_rate_pen end, r.unit_id, 'platform',
      nullif(left(btrim(r.guest), 200), ''), r.stay_start, r.stay_end, 'airbnb', r.guests, null,
      'airbnb_csv', 'airbnb:' || r.ref
    ) on conflict (org_id, source, external_ref) where external_ref is not null do nothing
    returning id into v_rental;

    if v_rental is null then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;
    v_inserted := v_inserted + 1;

    if coalesce(r.fee_cents, 0) > 0 then
      v_fee := null;
      insert into public.finance_entries (
        org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id, payment_method,
        related_entry_id, created_by, source, external_ref
      ) values (
        p_org_id, 'expense', v_fee_cat, r.occurred_on, r.fee_cents::integer, r.currency::public.currency_code,
        case when r.currency = 'USD' then p_fx_rate_pen end, r.unit_id, 'platform',
        v_rental, null, 'airbnb_csv', 'airbnb:' || r.ref || ':fee'
      ) on conflict (org_id, source, external_ref) where external_ref is not null do nothing
      returning id into v_fee;
      if v_fee is not null then v_fee_count := v_fee_count + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'duplicates', v_duplicates,
    'skipped_future', v_future, 'skipped_overlap', v_overlap, 'commissions', v_fee_count);
end;
$$;

revoke all on function public.import_airbnb_history(uuid, jsonb, numeric) from public, anon;
grant execute on function public.import_airbnb_history(uuid, jsonb, numeric) to authenticated;
