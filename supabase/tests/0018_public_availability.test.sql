-- SD-308: public.get_public_unit_availability — the only anonymous door to occupancy.
-- Ids from supabase/seed.sql: Saywa org bf88f504-..., property 131583b5-..., unit ee204001-...0001;
-- Demo org ff24bacc-..., property 57f914ac-..., unit ee204001-...0002.
-- Dates are relative to "today in America/Lima" so the clipping rules are tested at any date.
begin;
select plan(34);

create temp table t as select (now() at time zone 'America/Lima')::date as d;
grant select on t to anon, authenticated;

-- Fixtures written as the table owner (what the service-role / RPC paths do).
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', daterange((select d + 10 from t), (select d + 12 from t), '[)'), 'manual', 'PRIVATE-NOTE'),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', daterange((select d - 2 from t), (select d + 2 from t), '[)'), 'manual', null),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', daterange((select d - 40 from t), (select d - 30 from t), '[)'), 'manual', 'PAST-NOTE'),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', daterange((select d + 725 from t), (select d + 740 from t), '[)'), 'manual', null),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', daterange((select d + 800 from t), (select d + 803 from t), '[)'), 'manual', null),
  ('ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712',
   'ee204001-0000-4000-8000-000000000002', daterange((select d + 10 from t), (select d + 15 from t), '[)'), 'manual', 'DEMO-PRIVATE');
insert into public.ical_feeds (id, org_id, unit_id, channel) values
  ('f3080000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817',
   'ee204001-0000-4000-8000-000000000001', 'airbnb');
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', daterange((select d + 12 from t), (select d + 14 from t), '[)'),
   'ical', 'f3080000-0000-4000-8000-000000000001', 'UID-SECRET@airbnb');
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id, expires_at) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', daterange((select d + 20 from t), (select d + 23 from t), '[)'),
   'booking', gen_random_uuid(), now() - interval '1 day');

-- ─── Shape and privileges ───────────────────────────────────────────────────
select ok((select prosecdef and provolatile = 's' and proconfig @> array['search_path=""']
  from pg_proc where oid = 'public.get_public_unit_availability(uuid,uuid,date,date)'::regprocedure),
  'RPC is STABLE SECURITY DEFINER with an empty search_path');
select is((select proargnames::text[] from pg_proc
  where oid = 'public.get_public_unit_availability(uuid,uuid,date,date)'::regprocedure),
  array['p_property_id','p_unit_id','p_from','p_to','start_date','end_date'],
  'Result exposes only start_date and end_date');
select ok(has_function_privilege('anon', 'public.get_public_unit_availability(uuid,uuid,date,date)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_public_unit_availability(uuid,uuid,date,date)', 'EXECUTE'),
  'anon and authenticated can execute the RPC');
select ok(not has_function_privilege('public', 'public.get_public_unit_availability(uuid,uuid,date,date)', 'EXECUTE'),
  'PUBLIC cannot execute the RPC by default');
select ok(not has_table_privilege('anon', 'public.calendar_blocks', 'SELECT'),
  'anon still has no SELECT on calendar_blocks');

-- ─── Anonymous visitor ──────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{}', true);

select throws_ok($$select * from public.calendar_blocks$$, '42501', null,
  'anon cannot read calendar_blocks directly');

select results_eq(
  $$select start_date, end_date from public.get_public_unit_availability(
      '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
      (select d from t), (select d + 30 from t))$$,
  $$select (select d from t), (select d + 2 from t)
    union all select (select d + 10 from t), (select d + 12 from t)
    union all select (select d + 12 from t), (select d + 14 from t)
    union all select (select d + 20 from t), (select d + 23 from t)$$,
  'Returns clipped, ordered ranges; adjacent ranges stay separate and half-open');

select is((select count(*)::int from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d + 12 from t), (select d + 14 from t))), 1,
  'Window [d+12, d+14) matches only the block starting on d+12 (the d+12 end of the previous block is free)');
select is((select count(*)::int from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d + 14 from t), (select d + 20 from t))), 0,
  'A window starting on a block''s end date does not include it');
select is((select count(*)::int from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d + 3 from t), (select d + 10 from t))), 0,
  'A window ending on a block''s start date does not include it');
select is((select count(*)::int from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d + 21 from t), (select d + 22 from t))), 1,
  'An expired hold still occupies its dates until released');
select results_eq(
  $$select start_date, end_date from public.get_public_unit_availability(
      '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
      (select d + 21 from t), (select d + 22 from t))$$,
  $$select (select d + 21 from t), (select d + 22 from t)$$,
  'Ranges are clipped to the requested window');

-- Past and far future are never disclosed.
select is((select count(*)::int from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d - 45 from t), (select d - 20 from t))), 0,
  'Past occupation is not disclosed');
select results_eq(
  $$select start_date, end_date from public.get_public_unit_availability(
      '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
      (select d + 720 from t), (select d + 780 from t))$$,
  $$select (select d + 725 from t), (select d + 731 from t)$$,
  'Far-future occupation is clipped to the horizon (today + 731)');
select is((select count(*)::int from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d + 790 from t), (select d + 830 from t))), 0,
  'Nothing is returned beyond the horizon');

-- Window validation.
select throws_ok($$select * from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d from t), (select d + 63 from t))$$, '22023', 'invalid window', 'Windows over 62 days are rejected');
select lives_ok($$select * from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d from t), (select d + 62 from t))$$, 'A 62-day window is accepted');
select throws_ok($$select * from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d + 5 from t), (select d + 5 from t))$$, '22023', 'invalid window', 'Empty windows are rejected');
select throws_ok($$select * from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d + 9 from t), (select d + 5 from t))$$, '22023', 'invalid window', 'Inverted windows are rejected');
select throws_ok($$select * from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    '-infinity', (select d + 5 from t))$$, '22023', 'invalid window', 'Infinite lower bound is rejected');
select throws_ok($$select * from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d from t), 'infinity')$$, '22023', 'invalid window', 'Infinite upper bound is rejected');
select throws_ok($$select * from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    null, (select d + 5 from t))$$, '22023', 'invalid window', 'Null dates are rejected');
select throws_ok($$select * from public.get_public_unit_availability(
    null, 'ee204001-0000-4000-8000-000000000001',
    (select d from t), (select d + 5 from t))$$, '22023', 'invalid window', 'Null property is rejected');

-- Multi-tenant: ids from another tenant, mixed pairs and random ids are all the same generic error.
select throws_ok($$select * from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000002',
    (select d from t), (select d + 30 from t))$$, '42501', 'not available',
  'Another tenant''s unit cannot be read through this tenant''s property');
select throws_ok($$select * from public.get_public_unit_availability(
    '57f914ac-3890-47c1-9d6d-1492782cf712', 'ee204001-0000-4000-8000-000000000001',
    (select d from t), (select d + 30 from t))$$, '42501', 'not available',
  'This tenant''s unit cannot be read through another tenant''s property');
select throws_ok($$select * from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', gen_random_uuid(),
    (select d from t), (select d + 30 from t))$$, '42501', 'not available', 'Unknown unit is rejected');
select throws_ok($$select * from public.get_public_unit_availability(
    gen_random_uuid(), 'ee204001-0000-4000-8000-000000000001',
    (select d from t), (select d + 30 from t))$$, '42501', 'not available', 'Unknown property is rejected');
select results_eq(
  $$select start_date, end_date from public.get_public_unit_availability(
      '57f914ac-3890-47c1-9d6d-1492782cf712', 'ee204001-0000-4000-8000-000000000002',
      (select d from t), (select d + 30 from t))$$,
  $$select (select d + 10 from t), (select d + 15 from t)$$,
  'The other tenant sees only its own unit''s ranges');

-- Unpublished property / inactive unit are indistinguishable from unknown (never "all free").
reset role;
update public.properties set published = false where id = '57f914ac-3890-47c1-9d6d-1492782cf712';
set local role anon;
select throws_ok($$select * from public.get_public_unit_availability(
    '57f914ac-3890-47c1-9d6d-1492782cf712', 'ee204001-0000-4000-8000-000000000002',
    (select d from t), (select d + 30 from t))$$, '42501', 'not available', 'Unpublished property is rejected');
reset role;
update public.properties set published = true where id = '57f914ac-3890-47c1-9d6d-1492782cf712';
update public.units set active = false where id = 'ee204001-0000-4000-8000-000000000002';
set local role anon;
select throws_ok($$select * from public.get_public_unit_availability(
    '57f914ac-3890-47c1-9d6d-1492782cf712', 'ee204001-0000-4000-8000-000000000002',
    (select d from t), (select d + 30 from t))$$, '42501', 'not available', 'Inactive unit is rejected');

-- ─── Privacy: nothing but dates in the payload ──────────────────────────────
select is((select count(*)::int from (
    select to_jsonb(r) as j from public.get_public_unit_availability(
      '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
      (select d from t), (select d + 30 from t)) r) x
  where j::text ~* '(PRIVATE|SECRET|airbnb|booking|ical|manual|note|uid|feed)'), 0,
  'Serialized rows contain no note, source, uid, feed or booking data');
select is((select array_agg(k order by k) from (
    select distinct jsonb_object_keys(to_jsonb(r)) k from public.get_public_unit_availability(
      '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
      (select d from t), (select d + 30 from t)) r) x),
  array['end_date','start_date'], 'Only the two date keys are present');

-- ─── Logged-in members of another org get no extra access ──────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
select is((select count(*)::int from public.calendar_blocks where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 0,
  'A Demo member still cannot read Saywa calendar_blocks');
select is((select count(*)::int from public.get_public_unit_availability(
    '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
    (select d from t), (select d + 30 from t))), 4,
  'The same public ranges (and only those) are returned to authenticated users');
reset role;

select * from finish();
rollback;
