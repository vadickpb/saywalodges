-- SD-421 (part 3): change the nightly price for a date range of one house, without touching seasons.
-- Seasons are property-wide and every unit needs a rate in each one, so a per-house range cannot be a season.
-- unit_price_overrides replaces the nightly amount (weekday and weekend) of its dates; extra-guest price and minimum
-- stay still come from the winning rate unless the range sets its own minimum. Ranges of one house never overlap:
-- set_unit_price_range trims whatever it overlaps. Writes only through the RPCs (members, like rates).
-- private.price_stay is replaced below; lib/domain/pricing.ts is its twin (ADR 0012) and carries the same rule.
-- Rollback: restore private.price_stay from 20261103230000_create_public_quote.sql, then drop the two functions and the table.
begin;

create table public.unit_price_overrides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  start_date date not null,
  end_date date not null,
  nightly_cents integer not null check (nightly_cents between 0 and 2000000000),
  min_nights integer check (min_nights between 1 and 365),
  created_at timestamptz not null default now(),
  constraint unit_price_overrides_dates check (isfinite(start_date) and isfinite(end_date) and end_date > start_date and end_date - start_date <= 732),
  constraint unit_price_overrides_unit_fkey foreign key (unit_id, property_id, org_id)
    references public.units(id, property_id, org_id) on delete cascade,
  constraint unit_price_overrides_no_overlap exclude using gist (
    org_id with =, unit_id with =, daterange(start_date, end_date, '[)') with &&
  )
);
create index unit_price_overrides_unit_idx on public.unit_price_overrides(org_id, unit_id, start_date);

alter table public.unit_price_overrides enable row level security;
create policy unit_price_overrides_select on public.unit_price_overrides for select to anon, authenticated
  using (private.is_member(org_id) or (private.is_property_published(property_id) and exists (
      select 1 from public.units u where u.id = unit_price_overrides.unit_id and u.active
    )));
revoke all on public.unit_price_overrides from public, anon, authenticated;
grant select on public.unit_price_overrides to anon, authenticated;
grant all on public.unit_price_overrides to service_role;

-- Removes [p_start, p_end) from the house's ranges, keeping the parts that stick out on either side.
create function private.carve_price_range(p_org_id uuid, p_unit_id uuid, p_start date, p_end date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.unit_price_overrides%rowtype;
begin
  for o in
    select * from public.unit_price_overrides
     where org_id = p_org_id and unit_id = p_unit_id and start_date < p_end and end_date > p_start
     for update
  loop
    delete from public.unit_price_overrides where id = o.id;
    if o.start_date < p_start then
      insert into public.unit_price_overrides (org_id, property_id, unit_id, start_date, end_date, nightly_cents, min_nights)
      values (o.org_id, o.property_id, o.unit_id, o.start_date, p_start, o.nightly_cents, o.min_nights);
    end if;
    if o.end_date > p_end then
      insert into public.unit_price_overrides (org_id, property_id, unit_id, start_date, end_date, nightly_cents, min_nights)
      values (o.org_id, o.property_id, o.unit_id, p_end, o.end_date, o.nightly_cents, o.min_nights);
    end if;
  end loop;
end;
$$;
revoke all on function private.carve_price_range(uuid, uuid, date, date) from public, anon, authenticated;

-- Dates are [p_start, p_end): p_end is the first night NOT changed (the check-out day).
create function public.set_unit_price_range(p_org_id uuid, p_unit_id uuid, p_start date, p_end date, p_nightly_cents integer, p_min_nights integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
begin
  if p_org_id is null or not coalesce(private.is_member(p_org_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_unit_id is null or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
     or p_end <= p_start or p_end - p_start > 732
     or p_nightly_cents is null or p_nightly_cents not between 0 and 2000000000
     or (p_min_nights is not null and p_min_nights not between 1 and 365) then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  select u.property_id into v_property from public.units u where u.id = p_unit_id and u.org_id = p_org_id;
  if v_property is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('price_range:' || p_unit_id::text, 0));
  perform private.carve_price_range(p_org_id, p_unit_id, p_start, p_end);
  insert into public.unit_price_overrides (org_id, property_id, unit_id, start_date, end_date, nightly_cents, min_nights)
  values (p_org_id, v_property, p_unit_id, p_start, p_end, p_nightly_cents, p_min_nights);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.set_unit_price_range(uuid, uuid, date, date, integer, integer) from public, anon;
grant execute on function public.set_unit_price_range(uuid, uuid, date, date, integer, integer) to authenticated;

-- Goes back to the season/base price for those dates.
create function public.clear_unit_price_range(p_org_id uuid, p_unit_id uuid, p_start date, p_end date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_org_id is null or not coalesce(private.is_member(p_org_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_unit_id is null or p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
     or p_end <= p_start or p_end - p_start > 732 then
    raise exception 'invalid range' using errcode = '22023';
  end if;
  if not exists (select 1 from public.units u where u.id = p_unit_id and u.org_id = p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('price_range:' || p_unit_id::text, 0));
  perform private.carve_price_range(p_org_id, p_unit_id, p_start, p_end);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.clear_unit_price_range(uuid, uuid, date, date) from public, anon;
grant execute on function public.clear_unit_price_range(uuid, uuid, date, date) to authenticated;

create or replace function private.price_stay(p_unit_id uuid, p_check_in date, p_check_out date, p_guests integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u public.units%rowtype;
  pr public.properties%rowtype;
  r public.unit_rates%rowtype;
  f public.fees%rowtype;
  v_count integer := p_check_out - p_check_in;
  v_extra_guests integer;
  v_day date;
  v_idx integer := 0;
  v_idx_day integer;
  v_win uuid;
  v_win_priority integer;
  v_ties integer;
  v_weekend boolean;
  v_nightly bigint;
  v_ov_cents integer;
  v_ov_min integer;
  v_extras bigint;
  v_night_total bigint;
  v_acc bigint := 0;
  v_fees_total bigint := 0;
  v_qty integer;
  v_fee_total bigint;
  v_nights jsonb := '[]'::jsonb;
  v_fees jsonb := '[]'::jsonb;
  v_total bigint;
  v_deposit bigint;
  c_max constant bigint := 2147483647; -- quotes.total_cents is an integer
begin
  select * into u from public.units where id = p_unit_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'UNIT_NOT_FOUND'); end if;
  select * into pr from public.properties where id = u.property_id and org_id = u.org_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'UNIT_NOT_FOUND'); end if;
  if v_count < 1 then return jsonb_build_object('ok', false, 'error', 'INVALID_DATES'); end if;
  if u.included_guests > u.max_guests then return jsonb_build_object('ok', false, 'error', 'INVALID_CONFIGURATION'); end if;
  if not u.active then return jsonb_build_object('ok', false, 'error', 'UNIT_INACTIVE'); end if;
  if p_guests < 1 then return jsonb_build_object('ok', false, 'error', 'INVALID_INPUT'); end if;
  if p_guests > u.max_guests then
    return jsonb_build_object('ok', false, 'error', 'CAPACITY_EXCEEDED', 'maxGuests', u.max_guests);
  end if;

  v_extra_guests := greatest(0, p_guests - u.included_guests);

  for v_idx_day in 0 .. v_count - 1 loop
    v_day := p_check_in + v_idx_day;
    -- Winning season: highest priority covering the night; two at the same priority would be ambiguous (the exclusion
    -- constraint on seasons already prevents it, kept for parity with the TypeScript engine).
    v_win := null;
    v_win_priority := null;
    select s.id, s.priority into v_win, v_win_priority
      from public.seasons s
     where s.property_id = u.property_id and s.org_id = u.org_id and v_day >= s.start_date and v_day < s.end_date
     order by s.priority desc, s.id
     limit 1;
    if v_win is not null then
      select count(*) into v_ties from public.seasons s
       where s.property_id = u.property_id and s.org_id = u.org_id and s.priority = v_win_priority
         and v_day >= s.start_date and v_day < s.end_date;
      if v_ties > 1 then return jsonb_build_object('ok', false, 'error', 'AMBIGUOUS_SEASON', 'date', v_day); end if;
    end if;

    -- A season without a rate is an incomplete setup, never permission to charge the base amount.
    select * into r from public.unit_rates
     where unit_id = u.id and org_id = u.org_id and season_id is not distinct from v_win;
    if not found then return jsonb_build_object('ok', false, 'error', 'MISSING_RATE', 'date', v_day); end if;
    -- A price range (SD-421) replaces the nightly amount of its dates; extra guests and, unless the range sets its own, the
    -- minimum stay still come from the winning rate.
    v_ov_cents := null;
    v_ov_min := null;
    select o.nightly_cents, o.min_nights into v_ov_cents, v_ov_min from public.unit_price_overrides o
     where o.unit_id = u.id and o.org_id = u.org_id and v_day >= o.start_date and v_day < o.end_date;
    -- The arrival night alone sets the minimum length of the stay.
    if v_idx = 0 and v_count < coalesce(v_ov_min, r.min_nights) then
      return jsonb_build_object('ok', false, 'error', 'MIN_NIGHTS', 'requiredNights', coalesce(v_ov_min, r.min_nights));
    end if;

    v_weekend := extract(isodow from v_day) in (5, 6); -- Friday and Saturday nights
    v_nightly := coalesce(v_ov_cents::bigint, case when v_weekend then coalesce(r.weekend_nightly_cents, r.nightly_cents) else r.nightly_cents end);
    v_extras := v_extra_guests::bigint * r.extra_guest_cents;
    v_night_total := v_nightly + v_extras;
    v_acc := v_acc + v_night_total;
    if v_acc > c_max then return jsonb_build_object('ok', false, 'error', 'AMOUNT_OVERFLOW'); end if;

    v_nights := v_nights || jsonb_build_array(jsonb_build_object(
      'date', to_char(v_day, 'YYYY-MM-DD'), 'rateId', r.id, 'seasonId', r.season_id, 'isWeekend', v_weekend,
      'nightlyCents', v_nightly, 'extraGuests', v_extra_guests, 'extraGuestUnitCents', r.extra_guest_cents,
      'extraGuestTotalCents', v_extras, 'totalCents', v_night_total));
    v_idx := v_idx + 1;
  end loop;

  for f in select * from public.fees where unit_id = u.id and org_id = u.org_id order by created_at, id loop
    -- A per-guest fee is charged once per stay, not once per guest-night.
    v_qty := case f.kind when 'per_stay' then 1 when 'per_night' then v_count else p_guests end;
    v_fee_total := f.amount_cents::bigint * v_qty;
    v_fees_total := v_fees_total + v_fee_total;
    if v_acc + v_fees_total > c_max then return jsonb_build_object('ok', false, 'error', 'AMOUNT_OVERFLOW'); end if;
    v_fees := v_fees || jsonb_build_array(jsonb_build_object(
      'id', f.id, 'name', f.name, 'kind', f.kind, 'quantity', v_qty, 'unitCents', f.amount_cents, 'totalCents', v_fee_total));
  end loop;

  v_total := v_acc + v_fees_total;
  v_deposit := (v_total * pr.deposit_percent + 50) / 100; -- integer half-up, no floating point
  return jsonb_build_object(
    'ok', true, 'unitId', u.id, 'propertyId', u.property_id, 'orgId', u.org_id, 'currency', pr.currency,
    'nightsCount', v_count, 'totalCents', v_total, 'depositCents', v_deposit,
    'breakdown', jsonb_build_object(
      'accommodationCents', v_acc, 'feesCents', v_fees_total, 'totalCents', v_total, 'depositPercent', pr.deposit_percent,
      'depositCents', v_deposit, 'balanceCents', v_total - v_deposit, 'nights', v_nights, 'fees', v_fees));
end;
$$;

commit;
