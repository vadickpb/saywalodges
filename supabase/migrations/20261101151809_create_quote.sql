-- SD-402: persist quotes with a server-computed price, and the per-property deposit policy (ADR 0009).
-- Additive migration: a new column with a default, a trigger on that column and a new function; no existing
-- object changes.
-- Rollback: drop function public.create_quote(uuid, uuid, date, date, integer, integer, integer, jsonb, integer);
--   drop trigger properties_guard_deposit_percent on public.properties;
--   drop function private.guard_deposit_percent();
--   alter table public.properties drop column deposit_percent;
--   (quotes already created stay valid: each one carries its own copy of total and deposit)
--
-- public.quotes has no member write grants (SD-401). create_quote is the only write path for members:
--  * SECURITY DEFINER with an empty search_path; the very first thing it does is private.is_member(p_org_id).
--  * The unit must belong to p_org_id, be active and fit p_guests. The currency is NEVER a parameter: it is
--    the property's own.
--  * The deposit is tied to the stored policy: p_deposit_cents must equal total * deposit_percent / 100 rounded
--    half-up, the same rounding as lib/domain/pricing.ts (ADR 0006).
--  * The total is computed by the application (quoteStay needs rates, seasons and fees, which live in
--    TypeScript). The function checks that the amounts agree with the breakdown but cannot recompute the
--    price: the trust boundary is org membership (ADR 0009).
--  * The breakdown is bounded (known keys, at most 366 nights, 120 kB) and each org is capped both on open
--    quotes and on quotes created per day, so a member cannot fill the shared database.
--  * anon has no access. Availability is not checked here: the exclusion constraint of calendar_blocks
--    decides when the quote becomes a booking (ADR 0003).

alter table public.properties
  add column deposit_percent integer not null default 50
  check (deposit_percent between 0 and 100);
grant update (deposit_percent) on public.properties to authenticated;

-- The deposit is commercial policy: members can edit the property, but only an owner may change this value.
-- auth.uid() is null for the table owner and service_role (migrations, tests, maintenance), which stay allowed.
create function private.guard_deposit_percent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deposit_percent is distinct from old.deposit_percent
     and auth.uid() is not null and not private.is_owner(new.org_id) then
    raise exception 'only an owner can change the deposit policy' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger properties_guard_deposit_percent
  before update of deposit_percent on public.properties
  for each row execute function private.guard_deposit_percent();

create function public.create_quote(
  p_org_id uuid,
  p_unit_id uuid,
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_total_cents integer,
  p_deposit_cents integer,
  p_breakdown jsonb,
  p_valid_hours integer default 72
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.units%rowtype;
  pr public.properties%rowtype;
  v_today date := (now() at time zone 'America/Lima')::date;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if p_org_id is null or not private.is_member(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_unit_id is null or p_check_in is null or p_check_out is null or p_guests is null
     or p_total_cents is null or p_deposit_cents is null or p_breakdown is null or p_valid_hours is null then
    raise exception 'missing argument' using errcode = '22004';
  end if;

  select * into u from public.units where id = p_unit_id and org_id = p_org_id;
  if not found then
    raise exception 'unit not found' using errcode = '42501';
  end if;
  if not u.active then
    raise exception 'unit is inactive' using errcode = '22023';
  end if;
  select * into pr from public.properties where id = u.property_id and org_id = p_org_id;
  if not found then
    raise exception 'unit not found' using errcode = '42501';
  end if;

  if not (isfinite(p_check_in) and isfinite(p_check_out)) or p_check_out <= p_check_in
     or p_check_out - p_check_in > 366 or p_check_in < v_today then
    raise exception 'invalid dates' using errcode = '22007';
  end if;
  if p_guests < 1 or p_guests > u.max_guests then
    raise exception 'invalid guests' using errcode = '22023';
  end if;
  if p_valid_hours < 1 or p_valid_hours > 168 then
    raise exception 'invalid validity' using errcode = '22023';
  end if;

  -- The breakdown must be a bounded object. Separate IFs on purpose: SQL does not guarantee the order in which
  -- the terms of one OR are evaluated, and the later checks assume the earlier ones passed.
  if jsonb_typeof(p_breakdown) <> 'object' or length(p_breakdown::text) > 120000 then
    raise exception 'invalid breakdown' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_breakdown) k
             where k not in ('accommodationCents', 'feesCents', 'totalCents', 'depositPercent',
                             'depositCents', 'balanceCents', 'nights', 'fees')) then
    raise exception 'invalid breakdown' using errcode = '22023';
  end if;
  if jsonb_typeof(p_breakdown -> 'accommodationCents') is distinct from 'number'
     or jsonb_typeof(p_breakdown -> 'feesCents') is distinct from 'number'
     or jsonb_typeof(p_breakdown -> 'totalCents') is distinct from 'number'
     or jsonb_typeof(p_breakdown -> 'depositPercent') is distinct from 'number' then
    raise exception 'invalid breakdown' using errcode = '22023';
  end if;
  if ((p_breakdown -> 'nights') is not null and (jsonb_typeof(p_breakdown -> 'nights') <> 'array'
        or jsonb_array_length(p_breakdown -> 'nights') > 366))
     or ((p_breakdown -> 'fees') is not null and (jsonb_typeof(p_breakdown -> 'fees') <> 'array'
        or jsonb_array_length(p_breakdown -> 'fees') > 50)) then
    raise exception 'invalid breakdown' using errcode = '22023';
  end if;
  -- Amounts are non-negative whole cents.
  if exists (select 1 from unnest(array['accommodationCents', 'feesCents', 'totalCents', 'depositPercent']) k
             where (p_breakdown ->> k)::numeric < 0
                or (p_breakdown ->> k)::numeric <> trunc((p_breakdown ->> k)::numeric)) then
    raise exception 'invalid breakdown' using errcode = '22023';
  end if;

  -- The amounts must agree with the breakdown the application computed.
  if (p_breakdown ->> 'accommodationCents')::numeric + (p_breakdown ->> 'feesCents')::numeric <> p_total_cents
     or (p_breakdown ->> 'totalCents')::numeric <> p_total_cents then
    raise exception 'total does not match the breakdown' using errcode = '22023';
  end if;
  if (p_breakdown ->> 'depositPercent')::numeric <> pr.deposit_percent
     or p_deposit_cents <> floor((p_total_cents::numeric * pr.deposit_percent + 50) / 100) then
    raise exception 'deposit does not match the property policy' using errcode = '22023';
  end if;

  -- Bounds how many links, and how much data, an org can accumulate. The lock serialises concurrent calls
  -- of the same org so the caps cannot be overshot by a race. Open quotes include those already turned into a
  -- booking; that only makes the cap slightly stricter.
  perform pg_advisory_xact_lock(hashtextextended('create_quote:' || p_org_id::text, 0));
  if (select count(*) from public.quotes where org_id = p_org_id and expires_at > now()) >= 500
     or (select count(*) from public.quotes where org_id = p_org_id and created_at > now() - interval '1 day') >= 300 then
    raise exception 'too many quotes' using errcode = '54000';
  end if;

  -- 64 hex characters from two random UUIDs; no extension needed (check: >= 32).
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_expires := now() + make_interval(hours => p_valid_hours);

  insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
    total_cents, deposit_cents, breakdown, expires_at, created_by)
  values (p_org_id, u.property_id, u.id, v_token, p_check_in, p_check_out, p_guests, pr.currency,
    p_total_cents, p_deposit_cents, p_breakdown, v_expires, auth.uid())
  returning id into v_id;

  return jsonb_build_object('quote_id', v_id, 'token', v_token, 'expires_at', v_expires);
end;
$$;

revoke all on function public.create_quote(uuid, uuid, date, date, integer, integer, integer, jsonb, integer)
  from public, anon;
grant execute on function public.create_quote(uuid, uuid, date, date, integer, integer, integer, jsonb, integer)
  to authenticated;
