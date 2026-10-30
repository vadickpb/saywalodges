-- SD-305: run only using scripts/test-ical-concurrency.py against local Docker.
set search_path = public, extensions;
select plan(10);

create temp table had_dblink as select exists (select 1 from pg_extension where extname = 'dblink') as had;
create extension if not exists dblink with schema extensions;
delete from public.units where id = 'ee305002-0000-4000-8000-000000000001';
insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests)
values ('ee305002-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817',
  '131583b5-785e-4127-81f0-e097163c5654', 'Concurrency unit', 'room', 2, 1);

insert into public.ical_feeds (id,org_id,unit_id,channel,import_url)
values ('f3050000-0000-4000-8000-00000000cc01','bf88f504-051f-4fdc-ab73-4fa12d715817','ee305002-0000-4000-8000-000000000001','airbnb','https://www.airbnb.com/test');
select is(extensions.dblink_connect('sess_a', format(
  'host=%s port=%s dbname=%s user=postgres connect_timeout=5 application_name=sd305_concurrency_a',
  split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), current_database())),
  'OK', 'Session A connected');
select is(extensions.dblink_connect('sess_b', format(
  'host=%s port=%s dbname=%s user=postgres connect_timeout=5 application_name=sd305_concurrency_b',
  split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), current_database())),
  'OK', 'Session B connected');
select extensions.dblink_exec('sess_a', $$set statement_timeout = '15s'$$);
select extensions.dblink_exec('sess_b', $$set statement_timeout = '15s'$$);
select extensions.dblink_exec('sess_a', $$set idle_in_transaction_session_timeout = '30s'$$);
select extensions.dblink_exec('sess_b', $$set idle_in_transaction_session_timeout = '30s'$$);
select extensions.dblink_exec('sess_a', 'set role authenticated');
select extensions.dblink_exec('sess_b', 'set role authenticated');
select extensions.dblink_exec('sess_a', $$set request.jwt.claims = '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}'$$);
select extensions.dblink_exec('sess_b', $$set request.jwt.claims = '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}'$$);

create temp table probe (a_pid int, b_pid int);
insert into probe select a.pid, b.pid
from extensions.dblink('sess_a', 'select pg_backend_pid()') as a(pid int),
     extensions.dblink('sess_b', 'select pg_backend_pid()') as b(pid int);

-- Waits (max ~10 s) until session B is blocked on a lock held by another transaction.
create function pg_temp.wait_until_b_blocked() returns boolean language plpgsql as $$
begin
  for i in 1..100 loop
    perform pg_stat_clear_snapshot();
    if exists (select 1 from probe
               where a_pid = any(pg_blocking_pids(b_pid))) then
      return true;
    end if;
    perform pg_sleep(0.1);
  end loop;
  return false;
end;
$$;

-- A's uncommitted lease row lock must serialize a second begin from B.
select extensions.dblink_exec('sess_a','begin');
select ok((select doc is not null from extensions.dblink('sess_a', $$select public.begin_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-00000000cc01')$$) as t(doc jsonb)), 'A acquires lease');
select extensions.dblink_send_query('sess_b', $$select public.begin_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-00000000cc01')$$);
select ok(pg_temp.wait_until_b_blocked(), 'B waits on A feed lock');
select extensions.dblink_exec('sess_a','commit');
select is((select doc from extensions.dblink_get_result('sess_b') as t(doc jsonb)),null,'After A commits, B gets no lease');
select count(*) from extensions.dblink_get_result('sess_b') as t(doc jsonb);
-- Authenticated owner completion must also serialize on the exclusion constraint
-- against an uncommitted direct booking (SD-401 does not yet have bookings table).
select extensions.dblink_exec('sess_a','begin');
select extensions.dblink_exec('sess_a','reset role');
select extensions.dblink_exec('sess_a', $$insert into public.calendar_blocks(org_id,property_id,unit_id,period,source,booking_id)
values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee305002-0000-4000-8000-000000000001','[2098-01-01,2098-01-05)','booking',gen_random_uuid())$$);
select extensions.dblink_send_query('sess_b',format($q$select public.finish_ical_sync(
 'bf88f504-051f-4fdc-ab73-4fa12d715817','f3050000-0000-4000-8000-00000000cc01',%L,
 '[{"uid":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","start":"2098-01-02","end":"2098-01-04"}]')$q$,
 (select sync_token from public.ical_feeds where id='f3050000-0000-4000-8000-00000000cc01')));
select ok(pg_temp.wait_until_b_blocked(), 'Sync waits on concurrent direct reservation');
select extensions.dblink_exec('sess_a','commit');
select ok((select result from extensions.dblink_get_result('sess_b') as t(result boolean)), 'Sync completes after direct booking commit');
select count(*) from extensions.dblink_get_result('sess_b') as t(result boolean);
select is((select count(*)::int from public.calendar_blocks where unit_id='ee305002-0000-4000-8000-000000000001'),1,'Only direct booking occupies dates');
select is((select blocking_sources::text from public.sync_conflicts where feed_id='f3050000-0000-4000-8000-00000000cc01'),'{booking}','Concurrent conflict records direct booking');
select is((select count(*)::int from public.sync_conflicts where feed_id='f3050000-0000-4000-8000-00000000cc01'),1,'Exactly one conflict');
select extensions.dblink_disconnect('sess_a');
select extensions.dblink_disconnect('sess_b');
delete from public.units where id='ee305002-0000-4000-8000-000000000001';
select * from finish();
