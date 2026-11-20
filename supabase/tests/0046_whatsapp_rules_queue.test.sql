begin;
select no_plan();
-- Ids from supabase/seed.sql: Saywa org bf88f504-..., owner a3b45db1-..., staff c5d77e30-...; Demo org ff24bacc-..., owner bd6a1c86-...

select ok((select relrowsecurity from pg_class where oid = 'public.whatsapp_rules'::regclass), 'rules have RLS');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_rules', 'INSERT') and not has_table_privilege('authenticated', 'public.whatsapp_rules', 'UPDATE'),
  'nobody writes rules directly');
select ok(not has_function_privilege('anon', 'public.set_whatsapp_rule(uuid,text,boolean,integer,integer,integer)', 'EXECUTE'), 'anon cannot set rules');

-- Owner only.
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select throws_ok($$select public.set_whatsapp_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'confirmation', false, 0, 0, 24)$$, '42501', 'not allowed', 'staff cannot set rules');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.set_whatsapp_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'confirmation', false, 0, 0, 24)$$, '42501', 'not allowed', 'the owner of another organization cannot');
reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select throws_ok($$select public.set_whatsapp_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'nope', true, 0, 0, 24)$$, '22023', 'invalid rule', 'unknown kind');
select throws_ok($$select public.set_whatsapp_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'arrival_reminder', true, 1, 20, 10)$$, '22023', 'invalid rule', 'window must be start < end');
select throws_ok($$select public.set_whatsapp_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'arrival_reminder', true, 1, 0, 25)$$, '22023', 'invalid rule', 'hour out of range');
select throws_ok($$select public.set_whatsapp_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'post_stay', true, 9, 0, 24)$$, '22023', 'invalid rule', 'post stay at most 3 days after');
select lives_ok($$select public.set_whatsapp_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'post_stay', true, 1, 0, 24)$$, 'the owner sets a rule');
select lives_ok($$select public.set_whatsapp_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'post_stay', true, 2, 0, 24)$$, 'and updates it (one row per kind)');
select is((select count(*) from public.whatsapp_rules), 1::bigint, 'upsert, not duplicate');
reset role;
-- Isolation: another organization's member sees none of them.
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select is((select count(*) from public.whatsapp_rules), 0::bigint, 'rules are invisible to other organizations');
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select is((select count(*) from public.whatsapp_rules), 1::bigint, 'members can read their organization rules');
reset role;
delete from public.whatsapp_rules;

-- ─── Queue behaviour ────────────────────────────────────────────────────────
insert into public.quotes(org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at)
values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', repeat('a', 64), '2039-01-01', '2039-01-03', 2, 'USD', 10000, 5000, now() + interval '1 day');
set local role anon;
select lives_ok($$select public.create_checkout_booking(repeat('a', 64), 'Ana A', 'ana@example.com', '+51 999 888 777', 'es', true, 'v1')$$, 'booking with opt-in');
reset role;
update public.bookings set status = 'confirmed', confirmed_at = now(), expires_at = null;

create temp table clock as select extract(hour from now() at time zone 'America/Lima')::integer as h;

-- Rule off: nothing is queued.
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select public.set_whatsapp_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'confirmation', false, 0, 0, 24);
reset role;
select is(public.cron_claim_whatsapp_message(1), null, 'confirmation rule off: nothing is sent');
select is((select count(*) from public.whatsapp_outbox where kind = 'confirmation'), 0::bigint, 'and nothing was queued');

-- Window closed (current Lima hour excluded): nothing is queued while it is closed.
delete from public.whatsapp_rules;
insert into public.whatsapp_rules (org_id, kind, window_start, window_end)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'confirmation',
       case when h < 12 then 12 else 0 end, case when h < 12 then 24 else 12 end from clock;
select is(public.cron_claim_whatsapp_message(1), null, 'outside the window: nothing is claimed');
select is((select count(*) from public.whatsapp_outbox), 0::bigint, 'and nothing is queued');

-- Window open: queued once and claimed once, however many times the scheduler runs.
delete from public.whatsapp_rules;
insert into public.whatsapp_rules (org_id, kind, window_start, window_end)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'confirmation', 0, 24 from clock;
create temp table claims(payload jsonb);
insert into claims select public.cron_claim_whatsapp_message(1) from generate_series(1, 4);
select is((select count(*) from claims where payload ->> 'kind' = 'confirmation'), 1::bigint, 'running the scheduler 4 times claims the confirmation once');
select is((select count(*) from public.whatsapp_outbox where kind = 'confirmation'), 1::bigint, 'one row per booking and kind');

-- A rule switched off after queueing closes the pending row as skipped (never sent).
update public.whatsapp_outbox set attempted_at = null, outcome = null where kind = 'confirmation';
update public.whatsapp_rules set enabled = false where kind = 'confirmation';
select is(public.cron_claim_whatsapp_message(1) ->> 'skip', 'true', 'rule switched off after queueing: skipped');
select is((select outcome from public.whatsapp_outbox where kind = 'confirmation'), 'skipped', 'recorded as skipped');

-- Arrival reminder uses the owner's offset: with 0 days it is only due on the check-in day.
delete from public.whatsapp_outbox;
delete from public.whatsapp_rules;
set local session_replication_role = replica;
update public.bookings set check_in = (now() at time zone 'America/Lima')::date + 1, check_out = (now() at time zone 'America/Lima')::date + 3;
set local session_replication_role = origin;
update public.bookings set confirmed_at = now() - interval '5 days';
insert into public.whatsapp_rules (org_id, kind, offset_days, window_start, window_end) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'arrival_reminder', 0, 0, 24);
select is(public.cron_claim_whatsapp_message(1), null, 'arrival offset 0: tomorrow is too early');
update public.whatsapp_rules set offset_days = 2 where kind = 'arrival_reminder';
select is(public.cron_claim_whatsapp_message(1) ->> 'kind', 'arrival_reminder', 'arrival offset 2: due tomorrow');
select is(public.cron_claim_whatsapp_message(1), null, 'and not again');

-- Post stay after the owner's offset.
delete from public.whatsapp_outbox;
set local session_replication_role = replica;
update public.bookings set check_in = (now() at time zone 'America/Lima')::date - 4, check_out = (now() at time zone 'America/Lima')::date - 1;
set local session_replication_role = origin;
delete from public.whatsapp_rules;
insert into public.whatsapp_rules (org_id, kind, offset_days, window_start, window_end) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'post_stay', 3, 0, 24);
select is(public.cron_claim_whatsapp_message(1), null, 'post stay 3 days after check-out: not yet');
update public.whatsapp_rules set offset_days = 1 where kind = 'post_stay';
select is(public.cron_claim_whatsapp_message(1) ->> 'kind', 'post_stay', 'post stay 1 day after check-out: due');

-- Defaults without any rule: post stay waits for 14:00 on the check-out day only through its window.
select is((select enabled and offset_days = 1 and window_start = 9 and window_end = 20 from private.whatsapp_effective_rule('bf88f504-051f-4fdc-ab73-4fa12d715817', 'arrival_reminder', 1)),
  true, 'default arrival rule: on, 9-20 h');

select * from finish();
rollback;
