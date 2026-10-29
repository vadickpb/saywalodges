-- SD-304: ical_feeds and get_ical_export. Ids from supabase/seed.sql:
--   orgs  Saywa bf88f504-..., Demo ff24bacc-...
--   users Saywa owner a3b45db1-..., Saywa staff c5d77e30-..., Demo owner bd6a1c86-...
--   units Saywa ee204001-...0001, Demo ee204001-...0002
begin;
select plan(30);

-- ─── Owner creates one feed per channel ─────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

create temp table feeds (channel text, id uuid, token text);
grant all on feeds to authenticated, anon;
with ins as (
  insert into public.ical_feeds (org_id, unit_id, channel, import_url)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'airbnb', 'https://www.airbnb.com/calendar/ical/1.ics?s=x'),
         ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'booking', null)
  returning channel::text, id, export_token
)
insert into feeds select * from ins;

select is((select count(*)::int from public.ical_feeds), 2, 'The owner creates and sees one feed per channel');
select ok((select bool_and(token ~ '^[a-f0-9]{64}$') from feeds), 'Tokens are 64 hex characters');
select isnt((select token from feeds where channel = 'airbnb'), (select token from feeds where channel = 'booking'), 'Each feed has its own token');
select throws_ok(
  $$insert into public.ical_feeds (org_id, unit_id, channel) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'airbnb')$$,
  '23505', null, 'Only one feed per unit and channel');
select throws_ok(
  $$insert into public.ical_feeds (org_id, unit_id, channel, import_url) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'vrbo', 'http://example.com/a.ics')$$,
  '23514', null, 'The import URL must be https');
select throws_ok(
  $$insert into public.ical_feeds (org_id, unit_id, channel) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000002', 'vrbo')$$,
  '23503', null, 'A unit of another org cannot be used');
select throws_ok(
  $$update public.ical_feeds set export_token = repeat('a', 64)$$,
  '42501', null, 'The token cannot be written directly');
select lives_ok(
  $$update public.ical_feeds set import_url = 'https://www.booking.com/ical.ics' where channel = 'booking'$$,
  'The import URL can be edited');

-- ─── Blocks of the unit (written by a privileged role: users have no write grant) ─
reset role;
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', u.property_id, u.id, daterange('2030-01-01', '2030-01-03'), 'manual', 'SECRET-GUEST-NOTE'
  from public.units u where u.id = 'ee204001-0000-4000-8000-000000000001';
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', u.property_id, u.id, daterange('2030-02-01', '2030-02-05'), 'booking', gen_random_uuid()
  from public.units u where u.id = 'ee204001-0000-4000-8000-000000000001';
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', u.property_id, u.id, daterange('2030-03-01', '2030-03-04'), 'ical',
       (select id from feeds where channel = 'airbnb'), 'airbnb-1'
  from public.units u where u.id = 'ee204001-0000-4000-8000-000000000001';
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', u.property_id, u.id, daterange('2030-04-01', '2030-04-03'), 'ical',
       (select id from feeds where channel = 'booking'), 'booking-1'
  from public.units u where u.id = 'ee204001-0000-4000-8000-000000000001';

-- ─── Public export (anon, token only) ───────────────────────────────────────
set local role anon;
create temp table exported (channel text, doc jsonb);
grant all on exported to anon;
insert into exported select 'airbnb', public.get_ical_export((select token from feeds where channel = 'airbnb'));
insert into exported select 'booking', public.get_ical_export((select token from feeds where channel = 'booking'));

select results_eq(
  $$select (b->>'starts') from exported e, jsonb_array_elements(e.doc->'blocks') b where e.channel = 'airbnb' order by 1$$,
  $$values ('2030-01-01'::text), ('2030-02-01'), ('2030-04-01')$$,
  'The Airbnb calendar has manual, direct and Booking.com blocks but not Airbnb''s own');
select results_eq(
  $$select (b->>'starts') from exported e, jsonb_array_elements(e.doc->'blocks') b where e.channel = 'booking' order by 1$$,
  $$values ('2030-01-01'::text), ('2030-02-01'), ('2030-03-01')$$,
  'The Booking.com calendar has everything except its own imports');
select ok((select doc->>'unit' from exported where channel = 'airbnb') is not null, 'The unit name travels with the calendar');
select results_eq(
  $$select distinct k from exported e, jsonb_array_elements(e.doc->'blocks') b, jsonb_object_keys(b) k order by 1$$,
  $$values ('ends'::text), ('id'), ('starts')$$,
  'Blocks carry only id and dates');
select is((select position('SECRET-GUEST-NOTE' in doc::text) from exported where channel = 'airbnb'), 0, 'No notes in the export');
select is(public.get_ical_export(repeat('0', 64)), null, 'An unknown token returns nothing');
select is(public.get_ical_export('not-a-token'), null, 'A malformed token returns nothing');
select is(public.get_ical_export(null), null, 'A null token returns nothing');
select throws_ok($$select count(*) from public.ical_feeds$$, '42501', null, 'anon cannot read the feeds table');

-- ─── Regenerate ─────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
create temp table renewed (token text);
grant all on renewed to authenticated;
insert into renewed select public.regenerate_ical_token('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from feeds where channel = 'airbnb'));
select ok((select token from renewed) ~ '^[a-f0-9]{64}$' and (select token from renewed) <> (select token from feeds where channel = 'airbnb'),
  'Regenerating gives a new token');
select is(public.get_ical_export((select token from feeds where channel = 'airbnb')), null, 'The old token stops working');
select isnt(public.get_ical_export((select token from renewed)), null, 'The new token works');

-- ─── Staff and another org ──────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select is((select count(*)::int from public.ical_feeds), 0, 'Staff cannot see the feeds (the tokens are secrets)');
select throws_ok(
  $$select public.regenerate_ical_token('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from feeds where channel = 'booking'))$$,
  '42501', 'not allowed', 'Staff cannot regenerate a token');

reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select is((select count(*)::int from public.ical_feeds), 0, 'The other org sees no feeds');
select throws_ok(
  $$select public.regenerate_ical_token('ff24bacc-47d2-40bc-9210-f860e98892fd', (select id from feeds where channel = 'booking'))$$,
  '42501', 'feed not found', 'The other org cannot regenerate a feed that is not its own');
select throws_ok(
  $$select public.regenerate_ical_token('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from feeds where channel = 'booking'))$$,
  '42501', 'not allowed', 'Nor by naming the org that owns it');

-- ─── Deleting a feed removes what it imported ───────────────────────────────
reset role;
delete from public.ical_feeds where id = (select id from feeds where channel = 'airbnb');
select is((select count(*)::int from public.calendar_blocks where external_uid = 'airbnb-1'), 0, 'Deleting a feed deletes its imported blocks');
select is((select count(*)::int from public.calendar_blocks where unit_id = 'ee204001-0000-4000-8000-000000000001' and source <> 'ical'), 2, 'Other blocks stay');

-- A hold whose time ran out but that the cron has not released still blocks the
-- dates in the database (ADR 0003), so it is exported too: better a date shown as
-- taken a little longer than an overbooking.
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id, expires_at)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', u.property_id, u.id, daterange('2030-05-01', '2030-05-03'), 'booking', gen_random_uuid(), '2000-01-01'
  from public.units u where u.id = 'ee204001-0000-4000-8000-000000000001';
select ok(public.get_ical_export((select token from feeds where channel = 'booking'))::text like '%2030-05-01%',
  'An expired hold that was not released yet is still exported');

-- A block cannot point at a feed of another unit (or another org), and old stays
-- are not exported.
insert into public.ical_feeds (id, org_id, unit_id, channel) values
  ('f0000000-0000-4000-8000-0000000000aa', 'ff24bacc-47d2-40bc-9210-f860e98892fd', 'ee204001-0000-4000-8000-000000000002', 'airbnb');
select throws_ok(
  $$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', u.property_id, u.id, daterange('2030-09-01', '2030-09-03'), 'ical',
           'f0000000-0000-4000-8000-0000000000aa', 'cross'
      from public.units u where u.id = 'ee204001-0000-4000-8000-000000000001'$$,
  '23503', null, 'A block cannot reference a feed of another unit or org');
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', u.property_id, u.id, daterange('2000-01-01', '2000-01-03'), 'manual', 'old'
  from public.units u where u.id = 'ee204001-0000-4000-8000-000000000001';
select ok(position('2000-01-01' in public.get_ical_export((select token from feeds where channel = 'booking'))::text) = 0,
  'Stays that ended long ago are not exported');

select * from finish();
rollback;
