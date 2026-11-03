-- SD-404 (ADR 0012): create_public_quote prices the stay IN THE DATABASE for an anonymous guest.
-- The fixture and the figures are the same as lib/domain/pricing-parity.test.ts: keep both in sync with private.price_stay.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-... (subdomain saywa-lodges, published).
begin;
select plan(29);

-- ─── Fixture (table owner): a unit with its own rates, in 2040 so no seeded season interferes ─────────────
insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active) values
  ('ee404000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Parity Unit', 'room', 6, 2, true),
  ('ee404000-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Inactive Unit', 'room', 2, 2, false),
  ('ee404000-0000-4000-8000-000000000003', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'No Rates Unit', 'room', 2, 2, true);
insert into public.seasons (id, org_id, property_id, name, start_date, end_date, priority) values
  ('5e404000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'High 2040', '2040-01-01', '2040-02-01', 99);
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
insert into res select 's1', public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-01-27', '2040-01-30', 4);
insert into res select 's2', public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-03-02', '2040-03-05', 2);
insert into res select 's3', public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-01-31', '2040-02-02', 2);
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
select is((select count(*)::int from public.quotes where created_by is null and unit_id = 'ee404000-0000-4000-8000-000000000001'), 3, 'public quotes are stored with no author');
select ok((select token ~ '^[a-f0-9]{64}$' and expires_at between now() + interval '23 hours' and now() + interval '25 hours' and created_by is null
  from public.quotes where token = (select v->>'token' from res where k = 's1')), 'a 64-hex token valid for about 24 hours');
select ok((select (select v->>'token' from res where k = 's2') <> (select v->>'token' from res where k = 's3')), 'every call gets its own token (quotes are never shared between guests)');

-- ─── Business outcomes come back as data, not as errors ─────────────────────
set local role anon;
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-01-10', '2040-01-11', 2), '{"ok": false, "error": "MIN_NIGHTS", "requiredNights": 2}'::jsonb, 'S4 minimum stay of the arrival night');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-03-02', '2040-03-05', 7), '{"ok": false, "error": "CAPACITY_EXCEEDED", "maxGuests": 6}'::jsonb, 'S5 over capacity');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000002', '2040-03-02', '2040-03-05', 2)->>'error', 'UNIT_INACTIVE', 'an inactive unit cannot be quoted');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000003', '2040-03-02', '2040-03-05', 2)->>'error', 'MISSING_RATE', 'a unit with no rate is an incomplete setup, never a free stay');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2020-01-01', '2020-01-03', 2)->>'error', 'INVALID_DATES', 'a past date is refused');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-03-05', '2040-03-02', 2)->>'error', 'INVALID_DATES', 'check-out before check-in is refused');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-03-01', '2040-06-01', 2)->>'error', 'INVALID_DATES', 'a stay longer than 60 nights is refused');
select throws_ok($$select public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-03-02', '2040-03-05', 0)$$, '22023', null, 'zero guests is invalid input');
select throws_ok($$select public.create_public_quote(null, 'ee404000-0000-4000-8000-000000000001', '2040-03-02', '2040-03-05', 2)$$, '22004', null, 'a missing argument is refused');
reset role;

-- ─── Host scoping ───────────────────────────────────────────────────────────
set local role anon;
select is(public.create_public_quote('demo', 'ee404000-0000-4000-8000-000000000001', '2040-03-02', '2040-03-05', 2)->>'error', 'UNIT_NOT_FOUND', 'another site''s host cannot quote this unit');
select is(public.create_public_quote('SAYWA-LODGES', 'ee404000-0000-4000-8000-000000000001', '2040-03-02', '2040-03-05', 2)->>'ok', 'true', 'the host match ignores case');
reset role;
update public.properties set published = false where id = '131583b5-785e-4127-81f0-e097163c5654';
set local role anon;
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-03-02', '2040-03-05', 2)->>'error', 'UNIT_NOT_FOUND', 'an unpublished property answers like an unknown unit');
reset role;
update public.properties set published = true where id = '131583b5-785e-4127-81f0-e097163c5654';

-- ─── Availability ───────────────────────────────────────────────────────────
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001', daterange('2040-05-10', '2040-05-13', '[)'), 'manual', 'owner block');
set local role anon;
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-05-11', '2040-05-12', 2)->>'error', 'DATES_UNAVAILABLE', 'occupied dates are refused');
select is(public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-05-13', '2040-05-15', 2)->>'ok', 'true', 'the check-out day of a block is free for a new check-in');
reset role;

-- ─── Flood protection: capped below the owner's caps, and never counted against the owner ──────────────
-- top up to exactly 100 public quotes today (counts what already exists, deletes nothing)
insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at, created_by)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee404000-0000-4000-8000-000000000001',
       rpad('flood' || n, 64, 'a'), '2040-08-01', '2040-08-03', 2, 'USD', 30000, 15000, now() + interval '1 day', null
from generate_series(1, greatest(0, 100 - (select count(*)::int from public.quotes where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and created_by is null and created_at > now() - interval '1 day'))) n;
set local role anon;
select throws_ok($$select public.create_public_quote('saywa-lodges', 'ee404000-0000-4000-8000-000000000001', '2040-09-01', '2040-09-03', 2)$$, '54000', null, 'after 100 public quotes in a day the 101st is refused');
reset role;
select ok((select count(*) from public.quotes where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and created_at > now() - interval '1 day') < 300,
  'the flood stays well under the owner''s own cap of 300 a day (the owner can still quote)');

select * from finish();
rollback;
