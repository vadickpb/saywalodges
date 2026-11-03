-- SD-404 (ADR 0012): create_public_quote prices the stay IN THE DATABASE for an anonymous guest.
-- The fixture and the figures are the same as lib/domain/pricing-parity.test.ts: keep both in sync with private.price_stay.
-- Self-service quotes carry is_public (an explicit marker, not created_by). Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-... (subdomain saywa-lodges, published).
begin;
select plan(38);

-- The dates are relative to today (the public quote only accepts stays starting today or later and ending within about two years),
-- anchored on a FRIDAY so the weekday pattern, and therefore the golden figures, never change. d(0) is the first Friday on or after today + 500.
-- Same pattern as lib/domain/pricing-parity.test.ts (which uses fixed 2040 dates: the TypeScript engine has no horizon).
create function pg_temp.d(n integer) returns date language sql stable as $$
  select (current_date + 500 + ((12 - extract(isodow from current_date + 500)::int) % 7) + n)::date
$$;

-- ─── Fixture (table owner): a unit with its own rates, far enough ahead that no seeded season (all in 2027) interferes ─────────────
insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active) values
  ('ee404000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Parity Unit', 'room', 6, 2, true),
  ('ee404000-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Inactive Unit', 'room', 2, 2, false),
  ('ee404000-0000-4000-8000-000000000003', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'No Rates Unit', 'room', 2, 2, true);
insert into public.seasons (id, org_id, property_id, name, start_date, end_date, priority) values
  ('5e404000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'High 2040', pg_temp.d(-26), pg_temp.d(5), 99);
insert into public.unit_rates (org_id, property_id, unit_id, season_id, nightly_cents, weekend_nightly_cents, extra_guest_cents, min_nights) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001', null, 10000, 12000, 2000, 1),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001', '5e404000-0000-4000-8000-000000000001', 15000, null, 3000, 2);
insert into public.fees (org_id, property_id, unit_id, name, kind, amount_cents) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001', 'Limpieza', 'per_stay', 5000),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001', 'Tasa', 'per_night', 500),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001', 'Bienvenida', 'per_guest', 1000);

-- ─── Catalog and grants ─────────────────────────────────────────────────────
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'public.create_public_quote(text,uuid,date,date,integer)'::regprocedure, 'private.price_stay(uuid,date,date,integer)'::regprocedure)),
  'both functions are SECURITY DEFINER with an empty search_path');
select ok(has_function_privilege('anon', 'public.create_public_quote(text,uuid,date,date,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.price_stay(uuid,date,date,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.price_stay(uuid,date,date,integer)', 'EXECUTE'),
  'anon can quote, but cannot call the price engine directly');
select is((select array_agg(a order by ord) from pg_proc p, unnest(p.proargnames) with ordinality t(a, ord) where p.oid = 'public.create_public_quote(text,uuid,date,date,integer)'::regprocedure),
  array['p_host', 'p_unit_id', 'p_check_in', 'p_check_out', 'p_guests'], 'the caller can send no amount at all: only host, unit, dates and guests');
select is((select deposit_percent from public.properties where id = '131583b5-785e-4127-81f0-e097163c5654'), 50, 'precondition: the property deposit policy is 50 %');

-- ─── The golden figures (same as the TypeScript parity test) ────────────────
set local role anon;
create temp table res (k text primary key, v jsonb);
grant all on res to anon;
insert into res select 's1', public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(0), pg_temp.d(3), 4);
insert into res select 's2', public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(35), pg_temp.d(38), 2);
insert into res select 's3', public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(4), pg_temp.d(6), 2);
reset role;
select is((select (v->>'total_cents')::int || '/' || (v->>'deposit_cents')::int || '/' || (v->>'nights') from res where k = 's1'), '73500/36750/3', 'S1 high season, 4 guests');
select is((select (v->>'total_cents')::int || '/' || (v->>'deposit_cents')::int from res where k = 's2'), '42500/21250', 'S2 base season with the weekend price on Fri and Sat');
select is((select (v->>'total_cents')::int || '/' || (v->>'deposit_cents')::int from res where k = 's3'), '33000/16500', 'S3 a stay that crosses the end of the season');
select is((select (q.breakdown->>'accommodationCents') || '/' || (q.breakdown->>'feesCents') from public.quotes q where q.token = (select v->>'token' from res where k = 's1')),
  '63000/10500', 'the stored breakdown carries the same split');
select is((select array_agg((f->>'quantity')::int order by (f->>'quantity')::int) from public.quotes q, jsonb_array_elements(q.breakdown->'fees') f
  where q.token = (select v->>'token' from res where k = 's1')), array[1, 3, 4], 'fee quantities: per stay (1), per night (3 nights), per guest (4 guests)');
select is((select count(*)::int from jsonb_array_elements((select breakdown->'nights' from public.quotes where token = (select v->>'token' from res where k = 's2'))) n
  where (n->>'isWeekend')::boolean), 2, 'only Friday and Saturday nights are weekend nights');
select is((select count(*)::int from public.quotes where is_public and unit_id = 'ee404000-0000-4000-8000-000000000001'), 3, 'self-service quotes are marked public');
select ok((select token ~ '^[a-f0-9]{64}$' and expires_at between now() + interval '23 hours' and now() + interval '25 hours' and created_by is null and is_public
  from public.quotes where token = (select v->>'token' from res where k = 's1')), 'a 64-hex token valid for about 24 hours');
select ok((select (select v->>'token' from res where k = 's2') <> (select v->>'token' from res where k = 's3')), 'every call gets its own token (quotes are never shared between guests)');

-- ─── Business outcomes come back as data, not as errors ─────────────────────
set local role anon;
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(-17), pg_temp.d(-16), 2), '{"ok": false, "error": "MIN_NIGHTS", "requiredNights": 2}'::jsonb, 'S4 minimum stay of the arrival night');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(35), pg_temp.d(38), 7), '{"ok": false, "error": "CAPACITY_EXCEEDED", "maxGuests": 6}'::jsonb, 'S5 over capacity');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000002', pg_temp.d(35), pg_temp.d(38), 2)->>'error', 'UNIT_NOT_FOUND', 'an inactive unit answers like an unknown one (it is not even revealed)');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000003', pg_temp.d(35), pg_temp.d(38), 2)->>'error', 'MISSING_RATE', 'a unit with no rate is an incomplete setup, never a free stay');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2020-01-01', '2020-01-03', 2)->>'error', 'INVALID_DATES', 'a past date is refused');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(38), pg_temp.d(35), 2)->>'error', 'INVALID_DATES', 'check-out before check-in is refused');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(35), pg_temp.d(66), 2)->>'error', 'INVALID_DATES', 'a stay longer than 30 nights is refused');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(35), pg_temp.d(65), 2)->>'ok', 'true', 'exactly 30 nights is allowed');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', (current_date + 800), (current_date + 802), 2)->>'error', 'INVALID_DATES', 'dates more than about two years ahead are refused');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', 'infinity', 'infinity', 2)->>'error', 'INVALID_DATES', 'infinite dates answer INVALID_DATES, not a database error');
select throws_ok($$select public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(35), pg_temp.d(38), 0)$$, '22023', null, 'zero guests is invalid input');
select throws_ok($$select public.create_public_quote(null, 'ee404000-0000-4000-8000-000000000001', pg_temp.d(35), pg_temp.d(38), 2)$$, '22004', null, 'a missing argument is refused');
reset role;

-- ─── Host scoping ───────────────────────────────────────────────────────────
set local role anon;
select is(public.create_public_quote('demo', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(35), pg_temp.d(38), 2)->>'error', 'UNIT_NOT_FOUND', 'another site''s host cannot quote this unit');
select is(public.create_public_quote('SAYWA-LODGES', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(35), pg_temp.d(38), 2)->>'ok', 'true', 'the host match ignores case');
reset role;
update public.properties set published = false where id = '131583b5-785e-4127-81f0-e097163c5654';
set local role anon;
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(35), pg_temp.d(38), 2)->>'error', 'UNIT_NOT_FOUND', 'an unpublished property answers like an unknown unit');
reset role;
update public.properties set published = true where id = '131583b5-785e-4127-81f0-e097163c5654';

-- ─── Availability ───────────────────────────────────────────────────────────
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001', daterange(pg_temp.d(70), pg_temp.d(73), '[)'), 'manual', 'owner block');
set local role anon;
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(71), pg_temp.d(72), 2)->>'error', 'DATES_UNAVAILABLE', 'occupied dates are refused');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(73), pg_temp.d(75), 2)->>'ok', 'true', 'the check-out day of a block is free for a new check-in');
reset role;

-- ─── A unit cannot be pinned by bookings born from public quotes (3 at a time) ──────────────────────
insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active) values
  ('ee404000-0000-4000-8000-000000000004', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Exposure Unit', 'room', 2, 2, true);
insert into public.unit_rates (org_id, property_id, unit_id, season_id, nightly_cents, weekend_nightly_cents, extra_guest_cents, min_nights) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000004', null, 10000, null, 0, 1);
insert into public.guests (id, org_id, name, email) values ('b0280000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'Pinned Guest', 'pinned404@example.com');
insert into public.quotes (id, org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at, is_public)
select ('b1280000-0000-4000-8000-00000000000' || n)::uuid, 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000004',
       rpad('pin' || n, 64, 'b'), pg_temp.d(80 + n * 2), pg_temp.d(80 + n * 2 + 1), 2, 'USD', 10000, 5000, now() + interval '1 day', true
from generate_series(1, 3) n;
insert into public.bookings (id, org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out, guests, currency, total_cents, deposit_cents, status, expires_at)
select ('b2280000-0000-4000-8000-' || lpad((row_number() over (order by q.token))::text, 12, '0'))::uuid, q.org_id, q.property_id, q.unit_id, 'b0280000-0000-4000-8000-000000000001', q.id,
       q.check_in, q.check_out, 2, 'USD', 10000, 5000, 'pending_payment', now() + interval '1 hour'
from public.quotes q where q.token like 'pin%';
set local role anon;
select throws_ok($$select public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000004', pg_temp.d(120), pg_temp.d(121), 2)$$, '54000', null,
  'with 3 pending bookings from public quotes, a 4th quote for that unit is refused');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(120), pg_temp.d(121), 2)->>'ok', 'true',
  'other units are not affected');
reset role;

-- ─── Rounding and overflow, same engine as the TypeScript parity test ───────────────────────────────
insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active) values
  ('ee404000-0000-4000-8000-000000000005', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Overflow Unit', 'room', 2, 2, true);
insert into public.unit_rates (org_id, property_id, unit_id, season_id, nightly_cents, weekend_nightly_cents, extra_guest_cents, min_nights) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000005', null, 2000000000, null, 0, 1);
set local role anon;
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000005', pg_temp.d(90), pg_temp.d(92), 2)->>'error', 'AMOUNT_OVERFLOW', 'an amount above the integer column is refused, not truncated');
reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
update public.properties set deposit_percent = 33 where id = '131583b5-785e-4127-81f0-e097163c5654';
reset role;
select is(private.price_stay('ee404000-0000-4000-8000-000000000001', pg_temp.d(38), pg_temp.d(39), 2)->>'depositCents', '5775', 'S6: a 33 % deposit on 17500 rounds half up to 5775 (same figure as the TypeScript test)');
select is(private.price_stay('ee404000-0000-4000-8000-000000000001', pg_temp.d(38), pg_temp.d(39), 2)->>'totalCents', '17500', 'S6: the total of that stay');

-- ─── Flood protection: daily cap and open cap, always below the owner's own caps ─────────────────────
insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at, is_public)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001',
       rpad('flood' || n, 64, 'a'), pg_temp.d(100), pg_temp.d(102), 2, 'USD', 30000, 15000, now() + interval '1 day', true
from generate_series(1, greatest(0, 100 - (select count(*)::int from public.quotes where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and is_public and created_at > now() - interval '1 day'))) n;
set local role anon;
select throws_ok($$select public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(110), pg_temp.d(112), 2)$$, '54000', null, 'after 100 public quotes in a day the 101st is refused');
reset role;
select ok((select count(*) from public.quotes where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and created_at > now() - interval '1 day') < 300 + 200,
  'the public flood leaves the owner room under their own cap of 300 a day');
delete from public.quotes where token like 'flood%';
insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, created_at, expires_at, is_public)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001',
       rpad('openc' || n, 64, 'c'), pg_temp.d(100), pg_temp.d(102), 2, 'USD', 30000, 15000, now() - interval '2 days', now() + interval '1 day', true
from generate_series(1, greatest(0, 150 - (select count(*)::int from public.quotes where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and is_public and expires_at > now()))) n;
set local role anon;
select throws_ok($$select public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', pg_temp.d(110), pg_temp.d(112), 2)$$, '54000', null, 'with 150 open public quotes the next one is refused');
reset role;

select * from finish();
rollback;
