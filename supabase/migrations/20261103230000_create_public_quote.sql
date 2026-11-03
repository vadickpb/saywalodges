-- SD-404: a guest quotes a stay by themselves from the public site (ADR 0012).
-- Rollback: drop function public.create_public_quote(text, uuid, date, date, integer), private.price_stay(uuid, date, date, integer);
--   drop index public.quotes_public_idx; alter table public.quotes drop column is_public.
--
-- Trust model
--  * The caller is ANONYMOUS, so nothing about money may come from the caller. The function takes only the scenario (unit, dates,
--    guests) and the database computes the price from the stored rates, seasons, fees and the property's deposit policy.
--    private.price_stay is a port of lib/domain/pricing.ts#quoteStay (ADR 0006); both are pinned to the same hand-computed figures
--    (lib/domain/pricing-parity.test.ts and supabase/tests/0028_public_quote.test.sql). Change one, change the other.
--  * The unit must belong to a PUBLISHED property whose subdomain/custom domain is the host the page is served from.
--  * Business outcomes (min nights, capacity, dates taken, missing rate…) come back as {"ok": false, "error": CODE}; only malformed
--    input or abuse raise errors (22004/22023, 54000).
--  * Abuse (anyone with the public key can call this RPC directly, skipping the website, so only database limits count):
--      - public quotes are marked is_public and capped well below the owner's own caps (create_quote allows 500 open / 300 a day for
--        the whole org): 100 a day and 150 open, so nobody can lock the owner out of quoting;
--      - the chain quote -> booking -> voucher could pin a unit's dates (a voucher under review stops the hold from expiring until the
--        owner decides), so a unit may have at most 3 `pending_payment` bookings born from public quotes at a time, a public stay is at
--        most 30 nights and starts at most about two years ahead. Residual risk and the follow-ups are in ADR 0012.
--  * A quote is never shared between guests: each call creates its own quote with its own token.
begin;

-- Explicit marker of self-service quotes. NOT derived from created_by (it is set to null when a user is deleted, which would turn that
-- member's quotes into public ones).
alter table public.quotes add column is_public boolean not null default false;
create index quotes_public_idx on public.quotes (org_id, created_at) where is_public;

-- ─── Price engine (SQL port of quoteStay) ────────────────────────────────────
-- Returns {"ok": true, ...} or {"ok": false, "error": CODE, ...}. Money is whole cents; every amount fits quotes' integer columns.
create function private.price_stay(p_unit_id uuid, p_check_in date, p_check_out date, p_guests integer)
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
    -- The arrival night's rate alone sets the minimum length of the stay.
    if v_idx = 0 and v_count < r.min_nights then
      return jsonb_build_object('ok', false, 'error', 'MIN_NIGHTS', 'requiredNights', r.min_nights);
    end if;

    v_weekend := extract(isodow from v_day) in (5, 6); -- Friday and Saturday nights
    v_nightly := case when v_weekend then coalesce(r.weekend_nightly_cents, r.nightly_cents) else r.nightly_cents end;
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
revoke all on function private.price_stay(uuid, date, date, integer) from public, anon, authenticated;

-- ─── Public entry point ──────────────────────────────────────────────────────
create function public.create_public_quote(p_host text, p_unit_id uuid, p_check_in date, p_check_out date, p_guests integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
  v_today date := (now() at time zone 'America/Lima')::date;
  priced jsonb;
  v_org uuid;
  v_token text;
  v_expires timestamptz;
  v_id uuid;
begin
  if p_host is null or p_unit_id is null or p_check_in is null or p_check_out is null or p_guests is null then
    raise exception 'missing argument' using errcode = '22004';
  end if;
  if length(p_host) > 253 or p_guests < 1 or p_guests > 100 then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  -- The unit must be ACTIVE and belong to a published property served from this very host. Unknown unit, inactive unit, wrong host and
  -- unpublished property all answer the same, so nothing tells them apart.
  select u.id into v_unit
    from public.units u
    join public.properties p on p.id = u.property_id and p.org_id = u.org_id
   where u.id = p_unit_id and u.active and p.published and nullif(lower(p_host), '') in (p.subdomain, p.custom_domain);
  if v_unit is null then return jsonb_build_object('ok', false, 'error', 'UNIT_NOT_FOUND'); end if;

  -- Separate IFs on purpose: SQL does not guarantee the order in which the terms of one OR are evaluated.
  if not (isfinite(p_check_in) and isfinite(p_check_out)) then
    return jsonb_build_object('ok', false, 'error', 'INVALID_DATES');
  end if;
  -- At most 30 nights, starting today or later, ending within about two years (the horizon the public availability also shows).
  if p_check_out <= p_check_in or p_check_in < v_today or p_check_out - p_check_in > 30 or p_check_out > v_today + 731 then
    return jsonb_build_object('ok', false, 'error', 'INVALID_DATES');
  end if;

  -- Cheap check first. Advisory only: the exclusion constraint on calendar_blocks is the authority when the booking is made (ADR 0003).
  if exists (select 1 from public.calendar_blocks b
              where b.unit_id = p_unit_id and b.period && daterange(p_check_in, p_check_out, '[)')) then
    return jsonb_build_object('ok', false, 'error', 'DATES_UNAVAILABLE');
  end if;

  priced := private.price_stay(p_unit_id, p_check_in, p_check_out, p_guests);
  if not (priced ->> 'ok')::boolean then return priced; end if;
  v_org := (priced ->> 'orgId')::uuid;

  -- Caps, serialised per org. Public quotes are limited well below the owner's (500 open / 300 a day), and a unit can have at most 3
  -- pending-payment bookings that came from public quotes, which bounds how much of its calendar an abuser can pin.
  perform pg_advisory_xact_lock(hashtextextended('create_public_quote:' || v_org::text, 0));
  if (select count(*) from public.quotes where org_id = v_org and is_public and expires_at > now()) >= 150
     or (select count(*) from public.quotes where org_id = v_org and is_public and created_at > now() - interval '1 day') >= 100
     or (select count(*) from public.bookings b join public.quotes q on q.id = b.quote_id and q.org_id = b.org_id
          where b.unit_id = p_unit_id and b.status = 'pending_payment' and q.is_public) >= 3 then
    raise exception 'too many quotes' using errcode = '54000';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + interval '24 hours';
  insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
    total_cents, deposit_cents, breakdown, expires_at, created_by, is_public)
  values (v_org, (priced ->> 'propertyId')::uuid, p_unit_id, v_token, p_check_in, p_check_out, p_guests,
    (priced ->> 'currency')::public.currency_code, (priced ->> 'totalCents')::integer, (priced ->> 'depositCents')::integer,
    priced -> 'breakdown', v_expires, null, true)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires, 'currency', priced ->> 'currency',
    'total_cents', (priced ->> 'totalCents')::integer, 'deposit_cents', (priced ->> 'depositCents')::integer,
    'nights', (priced ->> 'nightsCount')::integer);
end;
$$;
revoke all on function public.create_public_quote(text, uuid, date, date, integer) from public;
grant execute on function public.create_public_quote(text, uuid, date, date, integer) to anon, authenticated, service_role;

commit;
