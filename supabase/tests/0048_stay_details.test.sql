begin;
select no_plan();
-- Ids from supabase/seed.sql: Saywa org bf88f504-..., owner a3b45db1-..., staff c5d77e30-...; Demo org ff24bacc-..., owner bd6a1c86-...

select ok((select relrowsecurity from pg_class where oid = 'public.stay_details'::regclass), 'stay_details has RLS');
select ok(not has_table_privilege('authenticated', 'public.stay_details', 'INSERT') and not has_table_privilege('authenticated', 'public.stay_details', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.stay_details', 'DELETE') and not has_table_privilege('anon', 'public.stay_details', 'SELECT'),
  'nobody writes directly; anon reads nothing');
select ok(not has_function_privilege('anon', 'public.save_stay_details(uuid,uuid,uuid,text,text,text,text,integer,text,text[],text,date)', 'EXECUTE'), 'anon cannot save');

-- Fixtures: an iCal reservation in Saywa and a web booking in Saywa; an iCal reservation in Demo.
insert into public.ical_feeds(id, org_id, unit_id, channel, import_url) values
  ('f1129000-0000-4000-8000-00000000000a', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'airbnb', 'https://www.airbnb.com/a'),
  ('f1129000-0000-4000-8000-00000000000c', 'ff24bacc-47d2-40bc-9210-f860e98892fd', 'ee204001-0000-4000-8000-000000000002', 'airbnb', 'https://www.airbnb.com/c');
create function pg_temp.sync(p_feed uuid, p_events jsonb) returns boolean language plpgsql as $$
declare t uuid := (public.cron_begin_ical_sync(p_feed)->>'token')::uuid;
begin return public.cron_finish_ical_sync(p_feed, t, p_events, null); end; $$;

-- ─── iCal sync keeps the Airbnb code and phone last-4 ───────────────────────────────────────────────────────
select ok(pg_temp.sync('f1129000-0000-4000-8000-00000000000a', jsonb_build_array(
  jsonb_build_object('uid', repeat('a', 64), 'start', '2039-05-01', 'end', '2039-05-04', 'code', 'HMABC12345', 'last4', '7788'),
  jsonb_build_object('uid', repeat('b', 64), 'start', '2039-05-10', 'end', '2039-05-12'))), 'sync with and without the extra keys');
select is((select ref_code || '|' || phone_last4 from public.stay_details where external_uid = repeat('a', 64)), 'HMABC12345|7788', 'code and last 4 stored');
select is((select count(*) from public.stay_details where external_uid = repeat('b', 64)), 0::bigint, 'an event without them creates no row');
select throws_ok($$select pg_temp.sync('f1129000-0000-4000-8000-00000000000a', jsonb_build_array(jsonb_build_object('uid', repeat('c', 64), 'start', '2039-06-01', 'end', '2039-06-02', 'code', 'bad code!')))$$, '22023', 'invalid event', 'malformed code rejected');
select throws_ok($$select pg_temp.sync('f1129000-0000-4000-8000-00000000000a', jsonb_build_array(jsonb_build_object('uid', repeat('c', 64), 'start', '2039-06-01', 'end', '2039-06-02', 'last4', '12')))$$, '22023', 'invalid event', 'malformed last4 rejected');
select throws_ok($$select pg_temp.sync('f1129000-0000-4000-8000-00000000000a', jsonb_build_array(jsonb_build_object('uid', repeat('c', 64), 'start', '2039-06-01', 'end', '2039-06-02', 'name', 'Ana')))$$, '22023', 'invalid event', 'unknown keys still rejected');

-- ─── Owners and staff save details; other organizations cannot ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select lives_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', null, 'f1129000-0000-4000-8000-00000000000a', repeat('a', 64),
  'Ana Pérez', '+51 999 888 777', 'es', 4, '15:30', array['crib', 'late_checkout'], 'Llegan de Cusco en taxi', '2039-04-30')$$, 'staff saves the details of an Airbnb stay');
reset role;
select is((select guest_name || '|' || party_size || '|' || arrival_time || '|' || ref_code from public.stay_details where external_uid = repeat('a', 64)), 'Ana Pérez|4|15:30|HMABC12345', 'saved, and the code from the feed is kept');
select is((select requests from public.stay_details where external_uid = repeat('a', 64)), array['crib', 'late_checkout'], 'chips stored');

-- A later sync does not overwrite what the owner typed.
select ok(pg_temp.sync('f1129000-0000-4000-8000-00000000000a', jsonb_build_array(
  jsonb_build_object('uid', repeat('a', 64), 'start', '2039-05-02', 'end', '2039-05-05', 'code', 'HMABC12345', 'last4', '7788'))), 'resync with moved dates');
select is((select guest_name from public.stay_details where external_uid = repeat('a', 64)), 'Ana Pérez', 'typed name survives a resync and a date change');
select is((select count(*) from public.stay_details where feed_id = 'f1129000-0000-4000-8000-00000000000a'), 1::bigint, 'still one row for the reservation');

select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', null, 'f1129000-0000-4000-8000-00000000000a', repeat('a', 64), 'X', null, 'es', null, null, '{}', null, null)$$, '42501', 'not allowed', 'another organization cannot write to this org');
select throws_ok($$select public.save_stay_details('ff24bacc-47d2-40bc-9210-f860e98892fd', null, 'f1129000-0000-4000-8000-00000000000a', repeat('a', 64), 'X', null, 'es', null, null, '{}', null, null)$$, '42501', 'not allowed', 'nor can it point its own org id at a foreign stay');
select is((select count(*) from public.stay_details), 0::bigint, 'and sees none of the other organization''s details');
reset role;

-- Validation.
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select throws_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', null, 'f1129000-0000-4000-8000-00000000000a', repeat('a', 64), 'Ana', null, 'es', null, null, array['teleport'], null, null)$$, '22023', 'invalid input', 'unknown request chip rejected');
select throws_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', null, 'f1129000-0000-4000-8000-00000000000a', repeat('a', 64), 'Ana', 'abc', 'es', null, null, '{}', null, null)$$, '22023', 'invalid input', 'bad phone rejected');
select throws_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', null, 'f1129000-0000-4000-8000-00000000000a', repeat('a', 64), 'Ana', null, 'es', null, '25:99', '{}', null, null)$$, '22023', 'invalid input', 'bad arrival time rejected');
select throws_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', null, 'f1129000-0000-4000-8000-00000000000a', repeat('a', 64), 'Ana', null, 'fr', null, null, '{}', null, null)$$, '22023', 'invalid input', 'bad language rejected');
select throws_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', gen_random_uuid(), 'f1129000-0000-4000-8000-00000000000a', repeat('a', 64), 'Ana', null, 'es', null, null, '{}', null, null)$$, '22023', 'invalid input', 'a booking AND an iCal key is rejected');
select throws_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', null, null, null, 'Ana', null, 'es', null, null, '{}', null, null)$$, '22023', 'invalid input', 'no key at all is rejected');
select throws_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', gen_random_uuid(), null, null, 'Ana', null, 'es', null, null, '{}', null, null)$$, '42501', 'not allowed', 'a booking that does not exist: same answer as a foreign one');
select lives_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', null, 'f1129000-0000-4000-8000-00000000000a', repeat('a', 64), '', '', 'es', null, '', '{}', '', null)$$, 'empty texts clear the fields');
reset role;
select is((select guest_name is null and guest_phone is null and arrival_time is null and note is null from public.stay_details where external_uid = repeat('a', 64)), true, 'cleared');

-- Web booking details.
insert into public.quotes(org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at)
values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', repeat('q', 64), '2039-02-01', '2039-02-03', 2, 'USD', 10000, 5000, now() + interval '1 day');
set local role anon;
select lives_ok($$select public.create_localized_booking_from_quote(repeat('q', 64), 'Beto B', 'beto@example.com', null, 'es')$$, 'web booking');
reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$select public.save_stay_details('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from public.bookings where guest_name = 'Beto B'), null, null,
  'Beto', null, 'en', 2, null, array['pet'], null, null)$$, 'details of a web booking');
select is((select count(*) from public.stay_details where booking_id is not null), 1::bigint, 'one row per booking (upsert, not duplicate)');
reset role;

-- A reservation that leaves the feed takes its details with it; a cancelled-and-removed feed too.
select ok(pg_temp.sync('f1129000-0000-4000-8000-00000000000a', '[]'::jsonb), 'reservation cancelled on Airbnb');
select is((select count(*) from public.stay_details where feed_id = 'f1129000-0000-4000-8000-00000000000a'), 0::bigint, 'its guest details are gone');

select * from finish();
rollback;
