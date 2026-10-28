-- SD-301: public.calendar_blocks (ADR 0003): overlap exclusion, field invariants,
-- RLS/privileges and the manual-block RPCs. Ids from supabase/seed.sql:
--   orgs  Saywa bf88f504-..., Demo ff24bacc-...
--   users Saywa owner a3b45db1-..., Saywa staff c5d77e30-..., Demo owner bd6a1c86-...
--   units Saywa ee204001-...0001 (property 131583b5-...), Demo ee204001-...0002 (property 57f914ac-...)
-- Real concurrency: ../tests-concurrency/0014_calendar_blocks_concurrency.test.sql
-- Run via python3 scripts/test-calendar-concurrency.py (required by CI).
begin;
select plan(80);

select has_table('public', 'calendar_blocks', 'calendar_blocks exists');
select ok((select relrowsecurity from pg_class where oid = 'public.calendar_blocks'::regclass),
  'calendar_blocks has RLS enabled');
select has_extension('extensions', 'btree_gist', 'btree_gist is installed');
select ok(exists (select 1 from pg_constraint where conname = 'calendar_blocks_no_overlap' and contype = 'x'),
  'The overlap rule is an EXCLUDE constraint');

-- Catalog assertions catch accidental privilege/search_path regressions.
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""'])
  from pg_proc where oid in (
    'public.create_manual_calendar_block(uuid,uuid,date,date,text)'::regprocedure,
    'public.delete_manual_calendar_block(uuid,uuid)'::regprocedure)),
  'Both RPCs are SECURITY DEFINER with an empty search_path');
select ok(not (select prosecdef from pg_proc
  where oid = 'private.touch_calendar_block_updated_at()'::regprocedure),
  'Timestamp trigger is SECURITY INVOKER');
select ok(not has_table_privilege('anon', 'public.calendar_blocks', 'INSERT')
  and not has_table_privilege('anon', 'public.calendar_blocks', 'UPDATE')
  and not has_table_privilege('anon', 'public.calendar_blocks', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.calendar_blocks', 'TRUNCATE'),
  'Neither API role can bypass RPCs using extra table privileges');

-- ─── Constraints, as the table owner (what service-role/RPC code paths see) ──
insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests)
values ('ee301001-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817',
  '131583b5-785e-4127-81f0-e097163c5654', 'Second Saywa unit', 'room', 2, 1);

select lives_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id, expires_at)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-10,2027-06-15)', 'booking', gen_random_uuid(), now() + interval '1 hour')$$,
  'A booking hold with an expiry is stored');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-10,2027-06-15)', 'manual', 'same dates')$$,
  '23P01', null, 'Identical dates on the same unit are rejected');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-12,2027-06-20)', 'manual', 'overlaps the end')$$,
  '23P01', null, 'A block starting inside an existing one is rejected');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-05,2027-06-11)', 'manual', 'overlaps the start')$$,
  '23P01', null, 'A block ending inside an existing one is rejected (one shared night)');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-11,2027-06-12)', 'manual', 'contained')$$,
  '23P01', null, 'A block inside an existing one is rejected');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-01,2027-07-01)', 'manual', 'containing')$$,
  '23P01', null, 'A block containing an existing one is rejected');
select lives_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-15,2027-06-18)', 'manual', 'check-in = previous check-out')$$,
  'Check-in on the previous check-out day is NOT an overlap');
select lives_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-08,2027-06-10)', 'manual', 'check-out = next check-in')$$,
  'Check-out on the next check-in day is NOT an overlap');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-17,2027-06-19)', 'manual', 'overlaps the adjacent block')$$,
  '23P01', null, 'Adjacency does not weaken the rule for the neighbouring block');
select lives_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee301001-0000-4000-8000-000000000001', '[2027-06-10,2027-06-15)', 'manual', 'other unit, same dates')$$,
  'The same dates on another unit are free');
select lives_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712',
  'ee204001-0000-4000-8000-000000000002', '[2027-06-10,2027-06-15)', 'manual', 'other org, same dates')$$,
  'The same dates in another org are free');
select lives_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-20,2027-06-21)', 'manual', 'one night')$$,
  'A one-night block is valid');
select results_eq(
  $$select period::text from public.calendar_blocks where note = 'one night'$$,
  $$values ('[2027-06-20,2027-06-21)'::text)$$, 'Periods are stored half-open [)');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', daterange('2027-08-01','2027-08-01'), 'manual', 'zero nights')$$,
  '23514', null, 'A zero-night (empty) period is rejected');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', daterange('2027-08-01','infinity'), 'manual', 'infinite')$$,
  '23514', null, 'An infinity upper date is rejected by the table too');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-08-01,)', 'manual', 'open ended')$$,
  '23514', null, 'An unbounded period is rejected');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-09-01,2027-09-03)', 'booking')$$,
  '23514', null, 'A booking block needs booking_id');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-09-01,2027-09-03)', 'ical', gen_random_uuid())$$,
  '23514', null, 'An ical block needs external_uid as well as feed_id');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-09-01,2027-09-03)', 'manual', gen_random_uuid())$$,
  '23514', null, 'A manual block cannot carry a booking_id');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, expires_at)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-09-01,2027-09-03)', 'manual', now())$$,
  '23514', null, 'Only booking holds can expire');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-09-01,2027-09-03)', 'manual', repeat('x', 501))$$,
  '23514', null, 'Overlong notes are rejected');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('ff24bacc-47d2-40bc-9210-f860e98892fd', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-09-01,2027-09-03)', 'manual', 'x')$$,
  '23503', null, 'A block cannot pair a unit with another org');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '57f914ac-3890-47c1-9d6d-1492782cf712',
  'ee204001-0000-4000-8000-000000000001', '[2027-09-01,2027-09-03)', 'manual', 'x')$$,
  '23503', null, 'A block cannot pair a unit with another property');
select lives_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-10-01,2027-10-03)', 'ical',
  'f0000000-0000-4000-8000-000000000001', 'uid-1@airbnb')$$, 'An imported event is stored');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-10-10,2027-10-12)', 'ical',
  'f0000000-0000-4000-8000-000000000001', 'uid-1@airbnb')$$,
  '23505', null, 'The same feed event cannot be stored twice');
select lives_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-10-10,2027-10-12)', 'ical',
  'f0000000-0000-4000-8000-000000000002', 'uid-1@airbnb')$$,
  'The same uid from another feed is a different event');
select is((select count(*)::int from public.calendar_blocks where unit_id = 'ee204001-0000-4000-8000-000000000001'
  and period && '[2027-06-10,2027-06-15)'::daterange), 1,
  'Exactly one block occupies the original stay');
update public.calendar_blocks set note = 'touched', updated_at = '2020-01-01' where note = 'one night';
select is((select updated_at from public.calendar_blocks where note = 'touched'), now(),
  'updated_at is maintained by trigger');
delete from public.units where id = 'ee301001-0000-4000-8000-000000000001';
select is((select count(*)::int from public.calendar_blocks where unit_id = 'ee301001-0000-4000-8000-000000000001'), 0,
  'Deleting a unit removes its blocks');

-- Additional source/range boundaries, kept distinct from existing occupied dates.
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id, feed_id)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2030-01-01,2030-01-03)', 'booking', gen_random_uuid(), gen_random_uuid())$$,
  '23514', null, 'A booking cannot carry feed metadata');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid, expires_at)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2030-01-01,2030-01-03)', 'ical', gen_random_uuid(), 'event', now())$$,
  '23514', null, 'Imported blocks cannot expire as payment holds');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2030-01-01,2030-01-03)', 'ical', gen_random_uuid(), '')$$,
  '23514', null, 'Empty external UIDs are rejected');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[-infinity,2030-01-03)', 'manual')$$,
  '23514', null, 'Negative infinity dates are rejected');
select is(daterange('2029-12-31', '2030-01-01', '[]')::text,
  '[2029-12-31,2030-01-02)', 'Discrete dateranges canonicalize inclusive ends; the RPC explicitly uses [)');
update public.calendar_blocks set expires_at = '2020-01-01' where source = 'booking';
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2027-06-10,2027-06-15)', 'manual')$$,
  '23P01', null, 'Expired holds still occupy dates until explicitly released (ADR 0003)');
select throws_ok($$update public.calendar_blocks set period = '[2027-06-10,2027-06-15)'
  where note = 'touched'$$, '23P01', null, 'Updates also enforce exclusion');

-- ─── Isolation and privileges ───────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select is((select count(*)::int from public.calendar_blocks where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 6,
  'Saywa owner sees the Saywa blocks');
select is((select count(*)::int from public.calendar_blocks where org_id = 'ff24bacc-47d2-40bc-9210-f860e98892fd'), 0,
  'Saywa owner sees none of the Demo blocks');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', '[2028-01-01,2028-01-03)', 'manual', 'direct')$$,
  '42501', null, 'A member cannot insert directly (RPC only)');
select throws_ok($$update public.calendar_blocks set note = 'x'$$, '42501', null,
  'A member cannot update directly');
select throws_ok($$delete from public.calendar_blocks$$, '42501', null,
  'A member cannot delete directly');
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
select is((select count(*)::int from public.calendar_blocks), 6, 'Saywa staff sees the Saywa blocks');
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
select is((select count(*)::int from public.calendar_blocks), 1, 'Demo owner sees only the Demo block');
select is((select count(*)::int from public.calendar_blocks where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 0,
  'Demo owner sees no Saywa block');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select count(*) from public.calendar_blocks$$, '42501', null, 'anon cannot read blocks');
select throws_ok($$delete from public.calendar_blocks$$, '42501', null, 'anon cannot delete blocks');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2028-01-01', '2028-01-03')$$, '42501', null,
  'anon cannot call create_manual_calendar_block');
select throws_ok($$select public.delete_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817', gen_random_uuid())$$,
  '42501', null, 'anon cannot call delete_manual_calendar_block');
reset role;

-- ─── create_manual_calendar_block ───────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
create temp table made (id uuid);
grant all on made to authenticated;
insert into made select public.create_manual_calendar_block(
  'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001',
  '2027-11-01', '2027-11-05', '  Maintenance  ');
select results_eq(
  $$select b.org_id::text, b.property_id::text, b.source::text, b.period::text, b.note, b.expires_at is null
      from public.calendar_blocks b where b.id = (select id from made)$$,
  $$values ('bf88f504-051f-4fdc-ab73-4fa12d715817'::text, '131583b5-785e-4127-81f0-e097163c5654'::text,
    'manual'::text, '[2027-11-01,2027-11-05)'::text, 'Maintenance'::text, true)$$,
  'The owner creates a manual block; org/property derive from the unit and the note is trimmed');
select lives_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2027-11-05', '2027-11-07')$$,
  'A block starting on the previous check-out day is accepted');
select is((select note from public.calendar_blocks where period = '[2027-11-05,2027-11-07)'), null,
  'No note is stored as null');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2027-11-04', '2027-11-06')$$, '23P01', null,
  'Overlapping a manual block is rejected by the constraint');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2027-06-12', '2027-06-13')$$, '23P01', null,
  'Overlapping a booking hold is rejected by the constraint');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2027-12-05', '2027-12-05')$$, '22023', null, 'Zero nights are rejected');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2027-12-05', '2027-12-01')$$, '22023', null, 'Reversed dates are rejected');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2027-12-01', 'infinity')$$, '22023', null, 'Infinite dates are rejected');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', null, '2027-12-01')$$, '22023', null, 'Null dates are rejected');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2027-12-01', '2027-12-03', repeat('x', 501))$$, '22023', null,
  'An overlong note is rejected');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-0000000000ff', '2027-12-01', '2027-12-03')$$, '42501', null,
  'An unknown unit is rejected');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000002', '2027-12-01', '2027-12-03')$$, '42501', null,
  'A unit of another org cannot be blocked with my org id');
select throws_ok($$select public.create_manual_calendar_block('ff24bacc-47d2-40bc-9210-f860e98892fd',
  'ee204001-0000-4000-8000-000000000002', '2027-12-01', '2027-12-03')$$, '42501', null,
  'A non-member cannot block another org''s unit');
select throws_ok($$select public.create_manual_calendar_block(null,
  'ee204001-0000-4000-8000-000000000001', '2027-12-01', '2027-12-03')$$, '42501', null, 'A null org is rejected');
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
select lives_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2027-12-10', '2027-12-12', 'staff block')$$,
  'Staff members can create manual blocks too');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2028-02-01', '2028-02-03')$$, '42501', null,
  'A session without a user is rejected');

-- ─── delete_manual_calendar_block ───────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
select throws_ok($$select public.delete_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from made))$$, '42501', null, 'A non-member cannot delete another org''s block');
select throws_ok($$select public.delete_manual_calendar_block('ff24bacc-47d2-40bc-9210-f860e98892fd',
  (select id from made))$$, '42501', null, 'Passing my own org does not reach a foreign block');
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select is((select count(*)::int from public.calendar_blocks where id = (select id from made)), 1,
  'The foreign delete attempts left the block in place');
select throws_ok($$select public.delete_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where source = 'booking'))$$, '42501', null,
  'Booking holds cannot be deleted through the manual RPC');
select throws_ok($$select public.delete_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where source = 'ical' and external_uid = 'uid-1@airbnb' and feed_id = 'f0000000-0000-4000-8000-000000000001'))$$,
  '42501', null, 'Imported events cannot be deleted through the manual RPC');
select throws_ok($$select public.delete_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817', gen_random_uuid())$$,
  '42501', null, 'An unknown block is rejected');
select lives_ok($$select public.delete_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from made))$$, 'The owner deletes a manual block');
select is((select count(*)::int from public.calendar_blocks where id = (select id from made)), 0,
  'The block is gone');
select lives_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', '2027-11-01', '2027-11-05')$$,
  'Deleting a block frees its dates');

reset role;
select * from finish();
rollback;
