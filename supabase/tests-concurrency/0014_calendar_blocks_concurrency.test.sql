-- SD-301: REAL concurrency on calendar_blocks (ADR 0003 / roadmap criterion).
-- A pgTAP file normally runs inside ONE transaction, which cannot race itself. This
-- file therefore has no begin/rollback and opens two extra sessions with dblink
-- (loopback to the same local server) that really commit/roll back:
--   A: begin + create_manual_calendar_block(dates)   -- holds the range, uncommitted
--   B: same dates, sent asynchronously                -- must WAIT for A's transaction
--   -> we assert B is blocked on a lock, then A commits: one block, B fails with 23P01.
--   -> variant: A rolls back instead: B wins, still one block.
--   -> adjacent dates (check-out = check-in) do not wait at all.
--   -> two simultaneous unsynchronised attempts: exactly one winner, one 23P01.
-- Both sessions run as the Saywa owner (role authenticated) through the real RPC.
--
-- Run with python3 scripts/test-calendar-concurrency.py (also a required CI step).
-- The controller is local supabase_admin over the container's Unix socket; dblink
-- also uses that socket, without passwords or Docker network/pg_hba TCP assumptions.
-- Workers switch to authenticated before calling RPCs. No app privileges are changed.
-- The runner validates TAP, bounds runtime and cleans fixtures/extensions on failure.
-- NEVER run against a remote database: the test commits real rows.
set search_path = public, extensions;
select plan(21);

create temp table had_dblink as select exists (select 1 from pg_extension where extname = 'dblink') as had;
create extension if not exists dblink with schema extensions;
delete from public.units where id = 'ee301002-0000-4000-8000-000000000001';
insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests)
values ('ee301002-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817',
  '131583b5-785e-4127-81f0-e097163c5654', 'Concurrency unit', 'room', 2, 1);

select is(extensions.dblink_connect('sess_a', format(
  'host=%s port=%s dbname=%s user=postgres connect_timeout=5 application_name=sd301_concurrency_a',
  split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), current_database())),
  'OK', 'Session A connected');
select is(extensions.dblink_connect('sess_b', format(
  'host=%s port=%s dbname=%s user=postgres connect_timeout=5 application_name=sd301_concurrency_b',
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

-- ─── Scenario 1: A holds the dates, B waits, A commits → B loses ────────────
select extensions.dblink_exec('sess_a', 'begin');
select extensions.dblink_exec('sess_a', $do$do $b$ begin perform public.create_manual_calendar_block(
  'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee301002-0000-4000-8000-000000000001',
  '2098-03-10', '2098-03-15', 'winner A'); end $b$$do$);
select is((select count(*)::int from public.calendar_blocks where unit_id = 'ee301002-0000-4000-8000-000000000001'), 0,
  'A has not committed: nothing is visible to other sessions yet');
select extensions.dblink_exec('sess_b', 'begin');
select is(extensions.dblink_send_query('sess_b', $$select public.create_manual_calendar_block(
  'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee301002-0000-4000-8000-000000000001',
  '2098-03-12', '2098-03-17', 'loser B')$$), 1, 'B sent its overlapping insert');
select ok(pg_temp.wait_until_b_blocked(), 'B is blocked waiting for A''s uncommitted transaction');
select is(extensions.dblink_is_busy('sess_b'), 1, 'B has not finished while A is open');
select extensions.dblink_exec('sess_a', 'commit');
select throws_ok($$select * from extensions.dblink_get_result('sess_b') as t(id uuid)$$, '23P01', null,
  'After A commits, B fails with exclusion_violation');
-- dblink leaves the failed query pending until its result set is drained.
select count(*) from extensions.dblink_get_result('sess_b', false) as t(id uuid);
select extensions.dblink_exec('sess_b', 'rollback');
select results_eq(
  $$select note from public.calendar_blocks where unit_id = 'ee301002-0000-4000-8000-000000000001'$$,
  $$values ('winner A'::text)$$, 'Exactly one block exists and it is the first transaction''s');

-- ─── Scenario 2: A holds the dates, B waits, A rolls back → B wins ──────────
select extensions.dblink_exec('sess_a', 'begin');
select extensions.dblink_exec('sess_a', $do$do $b$ begin perform public.create_manual_calendar_block(
  'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee301002-0000-4000-8000-000000000001',
  '2098-04-10', '2098-04-15', 'rolled back A'); end $b$$do$);
select extensions.dblink_exec('sess_b', 'begin');
select extensions.dblink_send_query('sess_b', $$select public.create_manual_calendar_block(
  'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee301002-0000-4000-8000-000000000001',
  '2098-04-12', '2098-04-17', 'winner B')$$);
select ok(pg_temp.wait_until_b_blocked(), 'B waits again for A''s uncommitted transaction');
select extensions.dblink_exec('sess_a', 'rollback');
select ok((select id is not null from extensions.dblink_get_result('sess_b') as t(id uuid)),
  'After A rolls back, B succeeds');
select count(*) from extensions.dblink_get_result('sess_b', false) as t(id uuid);
select extensions.dblink_exec('sess_b', 'commit');
select results_eq(
  $$select note from public.calendar_blocks where unit_id = 'ee301002-0000-4000-8000-000000000001'
      and period && '[2098-04-01,2098-05-01)'::daterange$$,
  $$values ('winner B'::text)$$, 'A rolled-back claim leaves no phantom block');

-- ─── Scenario 3: check-out = check-in never waits ───────────────────────────
select extensions.dblink_exec('sess_a', 'begin');
select extensions.dblink_exec('sess_a', $do$do $b$ begin perform public.create_manual_calendar_block(
  'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee301002-0000-4000-8000-000000000001',
  '2098-05-10', '2098-05-15', 'stay A'); end $b$$do$);
select extensions.dblink_exec('sess_b', 'begin');
select ok((select id is not null from extensions.dblink('sess_b', $$select public.create_manual_calendar_block(
  'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee301002-0000-4000-8000-000000000001',
  '2098-05-15', '2098-05-18', 'stay B')$$) as t(id uuid)),
  'B books from A''s check-out day while A is still open, without waiting');
select extensions.dblink_exec('sess_a', 'commit');
select extensions.dblink_exec('sess_b', 'commit');
select is((select count(*)::int from public.calendar_blocks where unit_id = 'ee301002-0000-4000-8000-000000000001'
  and period && '[2098-05-01,2098-06-01)'::daterange), 2, 'Both adjacent stays exist');

-- ─── Scenario 4 (complementary): two simultaneous attempts, nobody holding first ─
-- Not deterministic about WHO wins or whether they truly overlap in time; the proof of
-- real blocking is scenarios 1 and 2. It only asserts the invariant: one winner, one 23P01.
create temp table race (outcome text);
do $$
declare
  v_sql text := $q$select public.create_manual_calendar_block(
    'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee301002-0000-4000-8000-000000000001',
    '2098-07-01', '2098-07-05', 'race')$q$;
begin
  perform extensions.dblink_send_query('sess_a', v_sql);
  perform extensions.dblink_send_query('sess_b', v_sql);
  for i in 1..2 loop
    begin
      perform * from extensions.dblink_get_result(case i when 1 then 'sess_a' else 'sess_b' end) as t(id uuid);
      insert into race values ('won');
      perform * from extensions.dblink_get_result(case i when 1 then 'sess_a' else 'sess_b' end) as t(id uuid);
    exception when exclusion_violation then
      insert into race values ('lost');
      perform * from extensions.dblink_get_result(case i when 1 then 'sess_a' else 'sess_b' end, false) as t(id uuid);
    end;
  end loop;
end $$;
select is((select count(*)::int from race where outcome = 'won'), 1, 'Racing attempts: exactly one wins');
select is((select count(*)::int from race where outcome = 'lost'), 1, 'Racing attempts: the other gets 23P01');
select is((select count(*)::int from public.calendar_blocks where unit_id = 'ee301002-0000-4000-8000-000000000001'
  and note = 'race'), 1, 'Racing attempts: exactly one block stored');

-- ─── Scenario 5: source check stays atomic against a privileged writer ─────
select extensions.dblink_exec('sess_a', $do$do $b$ begin perform public.create_manual_calendar_block(
  'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee301002-0000-4000-8000-000000000001',
  '2098-08-01', '2098-08-05', 'source race'); end $b$$do$);
-- Future booking/iCal writers are privileged; simulate one changing the row.
select extensions.dblink_exec('sess_a', 'reset role');
select extensions.dblink_exec('sess_a', 'begin');
select extensions.dblink_exec('sess_a', $$update public.calendar_blocks
  set source = 'booking', booking_id = gen_random_uuid()
  where unit_id = 'ee301002-0000-4000-8000-000000000001' and note = 'source race'$$);
select extensions.dblink_send_query('sess_b', format(
  'select public.delete_manual_calendar_block(%L, %L)',
  'bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks
   where unit_id = 'ee301002-0000-4000-8000-000000000001' and note = 'source race')));
select ok(pg_temp.wait_until_b_blocked(), 'Manual delete waits for the writer changing source');
select extensions.dblink_exec('sess_a', 'commit');
select throws_ok($$select * from extensions.dblink_get_result('sess_b') as t(result text)$$,
  '42501', null, 'Manual delete rechecks the committed source and rejects a booking');
select count(*) from extensions.dblink_get_result('sess_b', false) as t(result text);
select is((select count(*)::int from public.calendar_blocks
  where unit_id = 'ee301002-0000-4000-8000-000000000001' and note = 'source race'),
  1, 'Concurrent source change cannot make the manual RPC delete a booking');
select is((select source::text from public.calendar_blocks
  where unit_id = 'ee301002-0000-4000-8000-000000000001' and note = 'source race'),
  'booking', 'The privileged source change is preserved');

-- ─── Cleanup ────────────────────────────────────────────────────────────────
select extensions.dblink_disconnect('sess_a');
select extensions.dblink_disconnect('sess_b');
delete from public.units where id = 'ee301002-0000-4000-8000-000000000001';
do $$ begin
  if not (select had from had_dblink) then drop extension dblink; end if;
end $$;
select is((select count(*)::int from public.calendar_blocks where unit_id = 'ee301002-0000-4000-8000-000000000001'),
  0, 'Cleanup removed every committed block');
select * from finish();
