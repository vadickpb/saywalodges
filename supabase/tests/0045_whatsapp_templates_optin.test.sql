begin;
select no_plan();

-- Privileges: the evidence and the queue are server-only.
select ok((select relrowsecurity from pg_class where oid = 'public.whatsapp_optins'::regclass), 'optins have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.whatsapp_outbox'::regclass), 'outbox has RLS');
select ok(not has_table_privilege('anon', 'public.whatsapp_optins', 'SELECT'), 'anon cannot read opt-ins');
select ok(not has_table_privilege('anon', 'public.whatsapp_optin_texts', 'INSERT') and not has_table_privilege('authenticated', 'public.whatsapp_optin_texts', 'UPDATE'), 'nobody but the server can change the canonical wording');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_optins', 'SELECT'), 'members cannot read opt-ins');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_optins', 'INSERT'), 'members cannot forge opt-ins');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_outbox', 'SELECT'), 'members cannot read the outbox');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_outbox', 'UPDATE'), 'members cannot reset claims');
select ok(not has_function_privilege('anon', 'public.cron_claim_whatsapp_message(integer)', 'EXECUTE'), 'anon cannot claim');
select ok(not has_function_privilege('authenticated', 'public.cron_claim_whatsapp_message(integer)', 'EXECUTE'), 'members cannot claim');
select ok(not has_function_privilege('authenticated', 'public.cron_settle_whatsapp_message(uuid,text)', 'EXECUTE'), 'members cannot settle');
select ok(not has_function_privilege('anon', 'public.cron_purge_whatsapp(integer)', 'EXECUTE'), 'anon cannot purge');
select ok(has_function_privilege('service_role', 'public.cron_claim_whatsapp_message(integer)', 'EXECUTE'), 'cron can claim');
select ok(has_function_privilege('anon', 'public.create_checkout_booking(text,text,text,text,text,boolean,text)', 'EXECUTE'), 'public checkout can convert');

insert into public.quotes(org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at)
values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', repeat('a', 64), '2039-01-01', '2039-01-03', 2, 'USD', 10000, 5000, now() + interval '1 day'),
       ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', repeat('b', 64), '2039-02-01', '2039-02-03', 2, 'USD', 10000, 5000, now() + interval '1 day'),
       ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', repeat('c', 64), '2039-03-01', '2039-03-03', 2, 'USD', 10000, 5000, now() + interval '1 day'),
       ('ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', 'ee204001-0000-4000-8000-000000000002', repeat('d', 64), '2039-01-01', '2039-01-03', 2, 'PEN', 10000, 5000, now() + interval '1 day');

-- Checkout conversion with opt-in evidence.
set local role anon;
select lives_ok($$select public.create_checkout_booking(repeat('a', 64), 'Ana A', 'ana@example.com', '+51 999 888 777', 'es', true, 'v1')$$, 'booking with opt-in');
select lives_ok($$select public.create_checkout_booking(repeat('b', 64), 'Beto B', 'beto@example.com', '999888666', 'en', false, null)$$, 'booking without opt-in');
select throws_ok($$select public.create_checkout_booking(repeat('c', 64), 'Cris C', 'cris@example.com', null, 'es', true, 'v1')$$, '22023', null, 'opt-in without a phone is rejected');
select throws_ok($$select public.create_checkout_booking(repeat('c', 64), 'Cris C', 'cris@example.com', '999888555', 'es', true, 'one')$$, '22023', null, 'bad text version rejected');
select throws_ok($$select public.create_checkout_booking(repeat('c', 64), 'Cris C', 'cris@example.com', '999888555', 'es', true, 'v9')$$, '22023', null, 'unknown wording version rejected (the evidence text is never caller-supplied)');
select throws_ok($$select public.create_checkout_booking(repeat('c', 64), 'Cris C', 'cris@example.com', '999888555', 'fr', false, null)$$, '22023', null, 'bad language rejected');
select throws_ok($$select public.create_checkout_booking(repeat('c', 64), 'Cris C', 'cris@example.com', '999888555', 'es', null, null)$$, '22023', null, 'null opt-in rejected');
select lives_ok($$select public.create_checkout_booking(repeat('a', 64), 'Ana A', 'ana@example.com', '+51 999 888 777', 'es', true, 'v1')$$, 'replay is accepted');
select lives_ok($$select public.create_checkout_booking(repeat('d', 64), 'Dora D', 'dora@example.com', '999111222', 'es', true, 'v1')$$, 'booking in the other tenant');
select throws_ok($$select * from public.whatsapp_optins$$, '42501', null, 'anon cannot read the evidence');
select throws_ok($$select * from public.whatsapp_outbox$$, '42501', null, 'anon cannot read the outbox');
reset role;

select is((select count(*) from public.whatsapp_optins), 2::bigint, 'one opt-in per consenting booking (no row without opt-in, none from the replay)');
select is((select text_version || '|' || lang || '|' || text_shown from public.whatsapp_optins o join public.bookings b on b.id = o.booking_id where b.guest_name = 'Ana A'),
  (select version || '|' || lang || '|' || body from public.whatsapp_optin_texts where version = 'v1' and lang = 'es'), 'evidence is the canonical wording copied by the database; a replay cannot rewrite it');
select ok((select granted_at is not null from public.whatsapp_optins limit 1), 'evidence has a timestamp');
select throws_ok($$insert into public.whatsapp_optins(org_id, booking_id, text_version, text_shown, lang)
  select 'ff24bacc-47d2-40bc-9210-f860e98892fd', id, 'v1', 'x', 'es' from public.bookings where guest_name = 'Beto B'$$, '23503', null, 'cross-tenant booking FK rejected');

-- Nothing is due yet: hold just started, nothing confirmed.
select is(public.cron_claim_whatsapp_message(1), null, 'nothing due at first');
select is((select count(*) from public.whatsapp_outbox), 0::bigint, 'nothing queued');

-- Deposit reminder: last third of the hold.
update public.bookings set created_at = now() - interval '2 hours', expires_at = now() + interval '30 minutes' where guest_name in ('Ana A', 'Beto B', 'Dora D');
create temp table claims(payload jsonb);
insert into claims select public.cron_claim_whatsapp_message(1) from generate_series(1, 5);
select is((select count(*) from claims where payload ->> 'kind' = 'deposit_reminder'), 2::bigint, 'reminder for both opted-in bookings (two tenants), none for the one without opt-in');
select is((select count(*) from public.whatsapp_outbox o join public.bookings b on b.id = o.booking_id where b.guest_name = 'Beto B'), 0::bigint, 'no opt-in: never even queued');
select ok((select bool_and((payload ->> 'opt_in')::boolean) from claims where payload ? 'kind'), 'claims carry the opt-in');
select is((select payload ->> 'org_id' from claims where payload ->> 'guest_name' = 'Ana A'), 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'org and booking come from the database');
select is((select payload ->> 'phone' from claims where payload ->> 'guest_name' = 'Ana A'), '+51 999 888 777', 'phone is the checkout snapshot');
select is(public.cron_claim_whatsapp_message(1), null, 'running again does not re-claim or re-queue');
select is((select count(*) from public.whatsapp_outbox), 2::bigint, 'one row per booking and kind');
select lives_ok($$select public.cron_settle_whatsapp_message((select id from public.whatsapp_outbox limit 1), 'simulated')$$, 'settle');
select throws_ok($$select public.cron_settle_whatsapp_message((select id from public.whatsapp_outbox limit 1), 'weird')$$, '22023', null, 'invalid outcome');
select throws_ok($$select public.cron_claim_whatsapp_message(99)$$, '22023', null, 'invalid window');

-- A voucher under review silences the reminder; a withdrawn consent silences everything.
update public.bookings set status = 'confirmed', confirmed_at = now(), expires_at = null where guest_name = 'Ana A';
update public.whatsapp_optins set revoked_at = now() where booking_id = (select id from public.bookings where guest_name = 'Dora D');
update public.bookings set status = 'confirmed', confirmed_at = now(), expires_at = null where guest_name = 'Dora D';
truncate claims;
insert into claims select public.cron_claim_whatsapp_message(1) from generate_series(1, 5);
select is((select count(*) from claims where payload ->> 'kind' = 'confirmation'), 1::bigint, 'confirmation for the opted-in booking only');
select is((select count(*) from public.whatsapp_outbox o join public.bookings b on b.id = o.booking_id where b.guest_name = 'Dora D' and o.kind = 'confirmation'), 0::bigint, 'revoked consent: not queued');

-- Revocation after queueing is re-checked at claim time.
-- Booking terms are immutable for everyone but the owner's RPCs; the test moves the dates with triggers off.
set local session_replication_role = replica;
update public.bookings set check_in = (now() at time zone 'America/Lima')::date + 1, check_out = (now() at time zone 'America/Lima')::date + 3 where guest_name = 'Ana A';
set local session_replication_role = origin;
insert into public.whatsapp_outbox(org_id, booking_id, kind)
  select org_id, id, 'post_stay' from public.bookings where guest_name = 'Ana A';
update public.whatsapp_optins set revoked_at = now() where booking_id = (select id from public.bookings where guest_name = 'Ana A');
select is(public.cron_claim_whatsapp_message(1) ->> 'skip', 'true', 'consent withdrawn after queueing: skipped');
select is((select outcome from public.whatsapp_outbox where kind = 'post_stay'), 'skipped', 'and recorded as skipped');
select is(public.cron_claim_whatsapp_message(1), null, 'queue empty');

-- Arrival reminder window and post-stay.
update public.whatsapp_optins set revoked_at = null where booking_id = (select id from public.bookings where guest_name = 'Ana A');
truncate claims;
insert into claims select public.cron_claim_whatsapp_message(1) from generate_series(1, 3);
select is((select count(*) from claims where payload ->> 'kind' = 'arrival_reminder'), 1::bigint, 'arrival reminder the day before check-in');
set local session_replication_role = replica;
update public.bookings set check_in = (now() at time zone 'America/Lima')::date - 4, check_out = (now() at time zone 'America/Lima')::date - 1 where guest_name = 'Ana A';
set local session_replication_role = origin;
truncate claims;
insert into claims select public.cron_claim_whatsapp_message(1) from generate_series(1, 3);
select is((select count(*) from claims where payload ->> 'kind' = 'post_stay'), 0::bigint, 'post_stay already settled as skipped earlier: unique(booking, kind) never re-sends');
select is((select count(*) from public.whatsapp_outbox where booking_id = (select id from public.bookings where guest_name = 'Ana A') and kind = 'post_stay'), 1::bigint, 'one row per booking and kind, always');

-- Abandoned claims are failed, never re-sent.
update public.whatsapp_outbox set attempted_at = now() - interval '2 hours', outcome = null where kind = 'arrival_reminder';
select is(public.cron_claim_whatsapp_message(1), null, 'abandoned claim is not re-sent');
select is((select outcome from public.whatsapp_outbox where kind = 'arrival_reminder'), 'failed', 'closed as failed');

-- Retention.
insert into public.whatsapp_messages(org_id, template, language, wamid, mode, created_at)
values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'booking_confirmation', 'es', 'sim_old', 'simulate', now() - interval '400 days'),
       ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'booking_confirmation', 'es', 'sim_new', 'simulate', now());
update public.whatsapp_outbox set created_at = now() - interval '400 days', outcome = coalesce(outcome, 'sent') where kind = 'confirmation';
select throws_ok($$select public.cron_purge_whatsapp(5)$$, '22023', null, 'retention cannot be shorter than 30 days');
select is(public.cron_purge_whatsapp(365) ->> 'messages', '1', 'old ledger rows are purged');
select is((select count(*) from public.whatsapp_messages where wamid = 'sim_new'), 1::bigint, 'recent ledger rows stay');
select is((select count(*) from public.whatsapp_outbox where kind = 'confirmation'), 0::bigint, 'old settled outbox rows are purged');

select * from finish();
rollback;
