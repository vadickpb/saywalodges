-- SD-307: service_role-only cron RPCs for the scheduled iCal sync, and the persistent alert ledger.
-- Ids from supabase/seed.sql: orgs Saywa bf88f504-..., Demo ff24bacc-...; owners a3b45db1-... (Saywa, owner@saywalodges.com),
-- bd6a1c86-... (Demo); Saywa staff c5d77e30-...; units ee204001-...0001 (Saywa), ...0002 (Demo).
begin;
select plan(59);

-- Feed A (Saywa, airbnb, url), B (Saywa, booking, NO url), C (Demo, airbnb, url).
insert into public.ical_feeds(id, org_id, unit_id, channel, import_url) values
 ('f3070000-0000-4000-8000-00000000000a', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'airbnb', 'https://www.airbnb.com/a'),
 ('f3070000-0000-4000-8000-00000000000b', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'booking', null),
 ('f3070000-0000-4000-8000-00000000000c', 'ff24bacc-47d2-40bc-9210-f860e98892fd', 'ee204001-0000-4000-8000-000000000002', 'airbnb', 'https://www.airbnb.com/c');
insert into public.calendar_blocks(org_id, property_id, unit_id, period, source, booking_id)
select org_id, property_id, id, daterange('2031-03-01', '2031-03-05', '[)'), 'booking', gen_random_uuid()
  from public.units where id = 'ee204001-0000-4000-8000-000000000001';

create function pg_temp.lease_token(p_feed uuid) returns uuid language sql as $$ select (public.cron_begin_ical_sync(p_feed)->>'token')::uuid $$;
create function pg_temp.finish_with(p_feed uuid, p_events jsonb, p_error text default null) returns boolean language plpgsql as $$
declare t uuid := (public.cron_begin_ical_sync(p_feed)->>'token')::uuid;
begin return public.cron_finish_ical_sync(p_feed, t, p_events, p_error); end; $$;
create temp table claim1(doc jsonb);
grant all on claim1 to service_role;

-- ─── Privileges ──────────────────────────────────────────────────────────────
select ok((select bool_and(has_function_privilege('service_role', p, 'EXECUTE')
    and not has_function_privilege('authenticated', p, 'EXECUTE') and not has_function_privilege('anon', p, 'EXECUTE'))
  from unnest(array['public.cron_list_due_ical_feeds(integer)', 'public.cron_begin_ical_sync(uuid)',
    'public.cron_finish_ical_sync(uuid,uuid,jsonb,text)', 'public.cron_claim_ical_alert(uuid,text)',
    'public.cron_settle_ical_alert(uuid,uuid,boolean)']) p), 'cron_* RPCs: service_role only');
select ok(not has_function_privilege('authenticated', 'private.begin_ical_sync_core(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.finish_ical_sync_core(uuid,uuid,uuid,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.begin_ical_sync_core(uuid,uuid)', 'EXECUTE'), 'cores (no auth check) are not callable by users');
select ok(has_function_privilege('authenticated', 'public.begin_ical_sync(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.finish_ical_sync(uuid,uuid,uuid,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.begin_ical_sync(uuid,uuid)', 'EXECUTE'), 'owner RPC grants unchanged');
select ok((select relrowsecurity from pg_class where relname = 'ical_alerts' and relnamespace = 'public'::regnamespace), 'RLS enabled on ical_alerts');
select ok(not has_table_privilege('authenticated', 'public.ical_alerts', 'SELECT') and not has_table_privilege('anon', 'public.ical_alerts', 'SELECT'), 'ical_alerts has no user access');

-- ─── Users cannot call the cron path, even the owner of the feed ─────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select throws_ok($$select public.cron_begin_ical_sync('f3070000-0000-4000-8000-00000000000a')$$, '42501', null, 'Owner cannot call cron_begin_ical_sync');
select throws_ok($$select public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'conflict')$$, '42501', null, 'Owner cannot claim alerts');
select throws_ok($$select failing_since from public.ical_feeds$$, '42501', null, 'failing_since is internal');
select throws_ok($$select * from public.ical_alerts$$, '42501', null, 'Owner cannot read the alert ledger');
reset role;
set local role anon;
select throws_ok($$select * from public.cron_list_due_ical_feeds(10)$$, '42501', null, 'anon cannot list feeds');
reset role;

-- ─── Scheduling ──────────────────────────────────────────────────────────────
set local role service_role;
select is((select count(*)::int from public.cron_list_due_ical_feeds(100) where feed_id in
  ('f3070000-0000-4000-8000-00000000000a', 'f3070000-0000-4000-8000-00000000000b', 'f3070000-0000-4000-8000-00000000000c')), 2,
  'Due feeds: those with an import URL (A, C), not B');
select is((select count(*)::int from public.cron_list_due_ical_feeds(1)), 1, 'The limit bounds the batch');
select is((select count(*)::int from public.cron_list_due_ical_feeds(0)), 1, 'A zero limit is clamped to 1');

-- ─── Lease, cross-tenant and snapshot semantics ──────────────────────────────
select ok(pg_temp.lease_token('f3070000-0000-4000-8000-00000000000a') is not null, 'Cron takes the lease');
select is(public.cron_begin_ical_sync('f3070000-0000-4000-8000-00000000000a'), null, 'A second run is refused while the lease is active');
select is((select count(*)::int from public.cron_list_due_ical_feeds(100) where feed_id = 'f3070000-0000-4000-8000-00000000000a'), 0, 'A feed attempted just now is not due again');
select throws_ok($$select public.cron_begin_ical_sync('f3070000-0000-4000-8000-00000000000b')$$, '42501', 'not allowed', 'Feed without import URL is refused');
select throws_ok($$select public.cron_begin_ical_sync(gen_random_uuid())$$, '42501', 'not allowed', 'Unknown feed is refused');
select is(public.cron_finish_ical_sync('f3070000-0000-4000-8000-00000000000c', gen_random_uuid(), '[]'), false, 'Wrong token never completes another feed');
select is(public.cron_finish_ical_sync('f3070000-0000-4000-8000-00000000000a', gen_random_uuid(), '[]'), false, 'Wrong token refused on the leased feed');
reset role;
update public.ical_feeds set sync_started_at = clock_timestamp() - interval '3 minutes' where id = 'f3070000-0000-4000-8000-00000000000a';
set local role service_role;
select throws_ok($$select pg_temp.finish_with('f3070000-0000-4000-8000-00000000000a', '[{"uid":"bad","start":"2031-01-01","end":"2031-01-02"}]')$$, '22023', 'invalid event', 'Invalid snapshot rejected');
select throws_ok($$select pg_temp.finish_with('f3070000-0000-4000-8000-00000000000a', '[]', 'private upstream text')$$, '22023', 'invalid error', 'Arbitrary error text cannot be stored');
select ok(pg_temp.finish_with('f3070000-0000-4000-8000-00000000000a', jsonb_build_array(jsonb_build_object('uid', repeat('a', 64), 'start', '2031-01-01', 'end', '2031-01-03'))), 'Cron applies a valid snapshot');
reset role;
select is((select org_id from public.calendar_blocks where feed_id = 'f3070000-0000-4000-8000-00000000000a'), 'bf88f504-051f-4fdc-ab73-4fa12d715817'::uuid, 'Imported block belongs to the feed''s own org');
select is((select count(*)::int from public.calendar_blocks where feed_id = 'f3070000-0000-4000-8000-00000000000c'), 0, 'Other tenant''s feed untouched');
select ok((select last_synced_at is not null and last_error is null and failing_since is null and last_attempt_at is not null from public.ical_feeds where id = 'f3070000-0000-4000-8000-00000000000a'), 'Success recorded');

set local role service_role;
select ok(pg_temp.finish_with('f3070000-0000-4000-8000-00000000000a', '[]', 'NETWORK'), 'Cron records a download failure');
reset role;
select is((select count(*)::int from public.calendar_blocks where feed_id = 'f3070000-0000-4000-8000-00000000000a'), 1, 'A failed sync preserves existing blocks');
select ok((select failing_since is not null and last_error = 'NETWORK' from public.ical_feeds where id = 'f3070000-0000-4000-8000-00000000000a'), 'Failure streak starts');
update public.ical_feeds set failing_since = now() - interval '30 hours' where id = 'f3070000-0000-4000-8000-00000000000a';
set local role service_role;
select ok(pg_temp.finish_with('f3070000-0000-4000-8000-00000000000a', '[]', 'FORMAT'), 'A second failure succeeds');
reset role;
select ok((select failing_since < now() - interval '29 hours' from public.ical_feeds where id = 'f3070000-0000-4000-8000-00000000000a'), 'The streak start is kept across failures');
set local role service_role;
select ok(pg_temp.finish_with('f3070000-0000-4000-8000-00000000000a', jsonb_build_array(jsonb_build_object('uid', repeat('a', 64), 'start', '2031-01-01', 'end', '2031-01-03'))), 'Recovery sync');
reset role;
select is((select failing_since from public.ical_feeds where id = 'f3070000-0000-4000-8000-00000000000a'), null, 'Success clears the failure streak');

-- ─── Alerts: conflict ────────────────────────────────────────────────────────
set local role service_role;
select is(public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'conflict'), null, 'No conflict, no alert');
select throws_ok($$select public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'other')$$, '22023', 'invalid kind', 'Unknown alert kind rejected');
select ok(pg_temp.finish_with('f3070000-0000-4000-8000-00000000000a', jsonb_build_array(
  jsonb_build_object('uid', repeat('a', 64), 'start', '2031-01-01', 'end', '2031-01-03'),
  jsonb_build_object('uid', repeat('d', 64), 'start', '2031-03-02', 'end', '2031-03-04'))), 'Sync creates a conflict against the direct booking');
insert into claim1 select public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'conflict');
select is((select doc->>'count' from claim1), '1', 'New conflict is claimed once');
select is((select doc->'recipients' from claim1), '["owner@saywalodges.com"]'::jsonb, 'Only the org owner is addressed (not staff, not other tenants)');
select is((select doc->>'channel' from claim1), 'airbnb', 'Payload carries the channel');
select is((select count(*)::int from jsonb_object_keys((select doc from claim1))), 5, 'Payload is a closed set: no dates, uids or guest data');
select is(public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'conflict'), null, 'A concurrent run cannot claim it again');
select lives_ok($$select public.cron_settle_ical_alert('f3070000-0000-4000-8000-00000000000a', (select (doc->>'claim_id')::uuid from claim1), false)$$, 'Failed delivery releases the claim');
select is((select doc->>'count' from (select public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'conflict') doc) x), '1', 'Released alert is retried');
select lives_ok($$select public.cron_settle_ical_alert('f3070000-0000-4000-8000-00000000000a',
  (select claim_id from public.ical_alerts where feed_id = 'f3070000-0000-4000-8000-00000000000a' and sent_at is null limit 1), true)$$, 'Delivered alert is settled');
select is(public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'conflict'), null, 'Delivered conflict is not alerted again');
select ok(pg_temp.finish_with('f3070000-0000-4000-8000-00000000000a', jsonb_build_array(
  jsonb_build_object('uid', repeat('a', 64), 'start', '2031-01-01', 'end', '2031-01-03'),
  jsonb_build_object('uid', repeat('d', 64), 'start', '2031-03-02', 'end', '2031-03-04'))), 'Re-sync recreates the same conflict row');
select is(public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'conflict'), null, 'Still not alerted: the ledger survives conflict row recreation');
select ok(pg_temp.finish_with('f3070000-0000-4000-8000-00000000000a', jsonb_build_array(
  jsonb_build_object('uid', repeat('a', 64), 'start', '2031-01-01', 'end', '2031-01-03'),
  jsonb_build_object('uid', repeat('d', 64), 'start', '2031-03-02', 'end', '2031-03-04'),
  jsonb_build_object('uid', repeat('e', 64), 'start', '2031-03-03', 'end', '2031-03-04'))), 'Sync adds a second conflict');
select is((select public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'conflict')->>'count'), '1', 'Only the new conflict is reported');
reset role;
update public.ical_alerts set claimed_at = now() - interval '11 minutes' where sent_at is null;
set local role service_role;
select is((select public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'conflict')->>'count'), '1', 'A crashed run''s stale claim is reclaimable');
select is(public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000c', 'conflict'), null, 'Another tenant''s feed has nothing to alert');

-- ─── Alerts: feed down > 24 h ────────────────────────────────────────────────
reset role;
update public.ical_feeds set failing_since = now() - interval '23 hours' where id = 'f3070000-0000-4000-8000-00000000000a';
set local role service_role;
select is(public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'feed_down'), null, 'Not down yet at 23 h');
reset role;
update public.ical_feeds set failing_since = now() - interval '25 hours' where id = 'f3070000-0000-4000-8000-00000000000a';
set local role service_role;
select is((select public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'feed_down')->>'count'), '1', 'Down for more than 24 h is alerted');
select is(public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'feed_down'), null, 'Not duplicated while the claim is open');
select lives_ok($$select public.cron_settle_ical_alert('f3070000-0000-4000-8000-00000000000a',
  (select claim_id from public.ical_alerts where feed_id = 'f3070000-0000-4000-8000-00000000000a' and kind = 'feed_down' and sent_at is null), true)$$, 'Down alert settled');
select is(public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'feed_down'), null, 'One alert per outage');
reset role;
update public.ical_feeds set failing_since = now() - interval '40 hours' where id = 'f3070000-0000-4000-8000-00000000000a';
set local role service_role;
select is((select public.cron_claim_ical_alert('f3070000-0000-4000-8000-00000000000a', 'feed_down')->>'count'), '1', 'A new outage alerts again');
reset role;

-- ─── A new URL starts a fresh history; deleting a feed removes its ledger ───
update public.ical_feeds set import_url = 'https://www.airbnb.com/changed' where id = 'f3070000-0000-4000-8000-00000000000a';
select ok((select failing_since is null and last_attempt_at is null and last_synced_at is null from public.ical_feeds where id = 'f3070000-0000-4000-8000-00000000000a'), 'URL change resets sync history');
delete from public.ical_feeds where id = 'f3070000-0000-4000-8000-00000000000a';
select is((select count(*)::int from public.ical_alerts where feed_id = 'f3070000-0000-4000-8000-00000000000a'), 0, 'Ledger rows cascade with the feed');

select * from finish();
rollback;
