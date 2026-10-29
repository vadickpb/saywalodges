begin;
select plan(51);
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
insert into public.ical_feeds(id,org_id,unit_id,channel,import_url) values
 ('f3050000-0000-4000-8000-000000000001','bf88f504-051f-4fdc-ab73-4fa12d715817','ee204001-0000-4000-8000-000000000001','airbnb','https://www.airbnb.com/test'),
 ('f3050000-0000-4000-8000-000000000002','bf88f504-051f-4fdc-ab73-4fa12d715817','ee204001-0000-4000-8000-000000000001','booking','https://ical.booking.com/test');
create function pg_temp.sync_snapshot(feed uuid, events jsonb, error_code text default null) returns boolean language plpgsql as $$
declare lease jsonb;
begin
 lease := public.begin_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817',feed);
 return public.finish_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817',feed,(lease->>'token')::uuid,events,error_code);
end; $$;
create temp table snapshots(doc jsonb);
insert into snapshots values (jsonb_build_array(
 jsonb_build_object('uid',repeat('a',64),'start','2031-01-01','end','2031-01-03'),
 jsonb_build_object('uid',repeat('b',64),'start','2031-01-03','end','2031-01-05')));
grant select on snapshots to authenticated;
set local role authenticated;
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',(select doc from snapshots)), 'Owner syncs a snapshot');
select is((select count(*)::int from public.calendar_blocks where feed_id='f3050000-0000-4000-8000-000000000001'),2,'Two adjacent events imported');
create temp table original_ids as select id from public.calendar_blocks where feed_id='f3050000-0000-4000-8000-000000000001';
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',(select doc from snapshots)), 'Repeated sync succeeds');
select results_eq($$select id from public.calendar_blocks where feed_id='f3050000-0000-4000-8000-000000000001' order by id$$,$$select id from original_ids order by id$$,'Idempotent: stable IDs, no duplicates');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object('uid',repeat('c',64),'start','2031-02-01','end','2031-02-03'))), 'Second feed imported');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',jsonb_build_array((select doc->0 from snapshots))), 'Missing event snapshot applied');
select is((select count(*)::int from public.calendar_blocks where feed_id='f3050000-0000-4000-8000-000000000001'),1,'Disappeared event removed');
select is((select count(*)::int from public.calendar_blocks where feed_id='f3050000-0000-4000-8000-000000000002'),1,'Other feed untouched');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001','[]','NETWORK'), 'Download error recorded');
select is((select count(*)::int from public.calendar_blocks where feed_id='f3050000-0000-4000-8000-000000000001'),1,'Failure preserves blocks');
select is((select last_error from public.ical_feeds where id='f3050000-0000-4000-8000-000000000001'),'NETWORK','Only safe error code persisted');
reset role;
insert into public.calendar_blocks(org_id,property_id,unit_id,period,source,booking_id)
select org_id,property_id,id,daterange('2031-03-01','2031-03-05','[)'),'booking',gen_random_uuid()
from public.units where id='ee204001-0000-4000-8000-000000000001';
set local role authenticated;
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('uid',repeat('d',64),'start','2031-03-02','end','2031-03-04'))), 'Conflict snapshot succeeds without overbooking');
select is((select count(*)::int from public.sync_conflicts),1,'Owner sees conflict');
select is((select blocking_sources::text from public.sync_conflicts),'{booking}','Direct booking identified');
select is((select period::text from public.sync_conflicts),'[2031-03-02,2031-03-04)','Conflict has half-open dates');
select is((select count(*)::int from public.calendar_blocks where source='booking'),1,'Direct booking preserved');
select is((select last_error from public.ical_feeds where id='f3050000-0000-4000-8000-000000000001'),null,'Successful sync clears previous error');
select ok((select last_synced_at is not null from public.ical_feeds where id='f3050000-0000-4000-8000-000000000001'),'Success timestamp set');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('uid',repeat('d',64),'start','2031-03-02','end','2031-03-04'))), 'Repeated conflict sync succeeds');
select is((select count(*)::int from public.sync_conflicts),1,'Conflict not duplicated');
create temp table lease as select public.begin_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-000000000001') doc;
select is(public.begin_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-000000000001'),null,'Concurrent sync refused while lease active');
update public.ical_feeds set import_url='https://www.airbnb.com/changed' where id='f3050000-0000-4000-8000-000000000001';
select is(public.finish_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-000000000001',(select (doc->>'token')::uuid from lease),'[]'),false,'URL change rejects stale completion');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001','[]'),'Valid empty snapshot succeeds');
select is((select count(*)::int from public.sync_conflicts),0,'Disappeared conflict removed');
-- Moving and swapping dates must not conflict with the feed's obsolete ranges.
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',(select doc from snapshots)), 'Restore adjacent events');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',jsonb_build_array(
 jsonb_build_object('uid',repeat('a',64),'start','2031-01-03','end','2031-01-05'),
 jsonb_build_object('uid',repeat('b',64),'start','2031-01-01','end','2031-01-03'))), 'UIDs can swap occupied ranges atomically');
select is((select count(*)::int from public.calendar_blocks where feed_id='f3050000-0000-4000-8000-000000000001'),2,'Swapped snapshot has exactly two events');
select is((select count(*)::int from public.sync_conflicts),0,'No false self-conflicts after moves');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('uid',repeat('e',64),'start','2031-02-01','end','2031-02-02'))), 'Other feed overlap recorded');
select is((select blocking_sources::text from public.sync_conflicts),'{ical}','Other feed is the blocking source');
select lives_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817','ee204001-0000-4000-8000-000000000001','2031-04-01','2031-04-03')$$,'Create manual blocker');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('uid',repeat('e',64),'start','2031-04-01','end','2031-04-02'))), 'Manual overlap recorded');
select is((select blocking_sources::text from public.sync_conflicts),'{manual}','Manual is the blocking source');
select lives_ok($$select public.delete_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817',(select id from public.calendar_blocks where source='manual' and period='[2031-04-01,2031-04-03)'))$$,'Resolve manual blocker');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('uid',repeat('e',64),'start','2031-04-01','end','2031-04-02'))), 'Previously conflicted event imported on retry');
select throws_ok($$select pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001','[{"uid":"bad","start":"2031-01-01","end":"2031-01-02"}]')$$,'22023','invalid event','Invalid payload rejected');
select throws_ok($$insert into public.sync_conflicts(org_id,feed_id,external_uid,period,blocking_sources) values ('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-000000000001',repeat('a',64),'[2031-01-01,2031-01-02)','{booking}')$$,'42501',null,'No direct conflict write');
select throws_ok($$select sync_token from public.ical_feeds$$,'42501',null,'Internal lease token not directly readable');
select throws_ok($$update public.ical_feeds set last_error='PII'$$,'42501',null,'Status not directly writable');
select is(public.finish_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-000000000001',gen_random_uuid(),'[]'),false,'Wrong completion token refused');
select throws_ok($$select pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',jsonb_build_array(
jsonb_build_object('uid',repeat('a',64),'start','2031-05-01','end','2031-05-02'),jsonb_build_object('uid',repeat('a',64),'start','2031-05-03','end','2031-05-04')))$$,'22023','duplicate uid','RPC rejects duplicate UID snapshot');
select throws_ok($$select pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001','[]','private upstream error')$$,'22023','invalid error','Arbitrary upstream text cannot be stored');
select ok(pg_temp.sync_snapshot('f3050000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('uid',repeat('d',64),'start','2031-03-02','end','2031-03-04'))), 'Create visible conflict for RLS probes');
select is((select count(*)::int from public.sync_conflicts),1,'Conflict exists before testing nonowners');
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select is((select count(*)::int from public.sync_conflicts),0,'Staff cannot read conflicts');
select throws_ok($$select public.begin_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-000000000001')$$,'42501','not allowed','Staff cannot sync');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select is((select count(*)::int from public.sync_conflicts),0,'Other org cannot see existing conflict');
select throws_ok($$select public.begin_ical_sync('ff24bacc-47d2-40bc-9210-f860e98892fd','f3050000-0000-4000-8000-000000000001')$$,'42501','not allowed','Other org cannot sync feed');
select throws_ok($$select public.finish_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-000000000001',gen_random_uuid(),'[]')$$,'42501','not allowed','Other owner cannot apply snapshot');
set local role anon;
select throws_ok($$select * from public.sync_conflicts$$,'42501',null,'Anonymous conflict access denied');
select throws_ok($$select public.begin_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-000000000001')$$,'42501',null,'Anonymous sync denied');
select * from finish();
rollback;
