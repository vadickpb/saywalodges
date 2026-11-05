begin;
select no_plan();
select ok((select relrowsecurity from pg_class where oid='public.booking_email_events'::regclass),'ledger has RLS');
select ok(not has_table_privilege('anon','public.booking_email_events','SELECT'),'anon cannot read event data');
select ok(not has_table_privilege('authenticated','public.booking_email_events','SELECT'),'members cannot read other tenant events or reset claims');
select ok(not has_table_privilege('authenticated','public.booking_email_events','UPDATE'),'members cannot reset claims');
select ok(not has_function_privilege('anon','public.cron_claim_booking_email(integer)','EXECUTE'),'anon cannot claim');
select ok(not has_function_privilege('authenticated','public.cron_claim_booking_email(integer)','EXECUTE'),'members cannot claim');
select ok(not has_function_privilege('anon','public.cron_settle_booking_email(uuid,text,integer)','EXECUTE'),'anon cannot settle');
select ok(not has_function_privilege('authenticated','public.cron_settle_booking_email(uuid,text,integer)','EXECUTE'),'members cannot settle');
select ok(has_function_privilege('service_role','public.cron_claim_booking_email(integer)','EXECUTE'),'cron can claim');

-- Same dates in two tenants; localized public conversion creates events atomically.
insert into public.quotes(org_id,property_id,unit_id,token,check_in,check_out,guests,currency,total_cents,deposit_cents,expires_at)
values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000001',repeat('a',64),'2039-01-01','2039-01-03',2,'USD',10000,5000,now()+interval '1 day'),
('ff24bacc-47d2-40bc-9210-f860e98892fd','57f914ac-3890-47c1-9d6d-1492782cf712','ee204001-0000-4000-8000-000000000002',repeat('b',64),'2039-01-01','2039-01-03',2,'PEN',10000,5000,now()+interval '1 day');
set local role anon;
select lives_ok($$select public.create_localized_booking_from_quote(repeat('a',64),'Guest A','a@example.com',null,'en')$$,'English booking');
select lives_ok($$select public.create_localized_booking_from_quote(repeat('a',64),'Guest A','a@example.com',null,'es')$$,'replay does not change language');
select lives_ok($$select public.create_booking_from_quote(repeat('b',64),'Guest B','b@example.com')$$,'old client still works');
select throws_ok($$select public.create_localized_booking_from_quote(repeat('b',64),'Guest B','b@example.com',null,'xx')$$,'22023',null,'rejects invalid language');
select throws_ok($$select * from public.booking_email_events$$,'42501',null,'anon cannot read either tenant');
reset role;
select is((select email_lang from public.bookings b join public.quotes q on q.id=b.quote_id where q.token=repeat('a',64)),'en','booking language persists across replay');
select is((select count(*) from public.booking_email_events),4::bigint,'one guest and one owner event per booking, no replay duplicates');
select is((select email_lang from public.bookings b join public.quotes q on q.id=b.quote_id where q.token=repeat('b',64)),'es','old clients default to Spanish');
select throws_ok($$insert into public.booking_email_events(org_id,booking_id,event)
 select org_id,booking_id,event from public.booking_email_events limit 1$$,'23505',null,'NULL payment ids deduplicate too');
select throws_ok($$insert into public.booking_email_events(org_id,booking_id,event)
 select 'ff24bacc-47d2-40bc-9210-f860e98892fd', b.id,'arrival' from public.bookings b where b.org_id='bf88f504-051f-4fdc-ab73-4fa12d715817'$$,'23503',null,'cross-tenant booking FK rejected');

insert into public.payments(org_id,booking_id,amount_cents,currency,method,voucher_path)
select org_id,id,5000,currency,'yape','voucher/test.png' from public.bookings where email_lang='en';
select is((select count(*) from public.booking_email_events where event='owner_voucher'),1::bigint,'each voucher queues owner notice');
update public.payments set status='rejected',reviewed_at=now() where voucher_path='voucher/test.png';
update public.payments set reject_reason='Check again' where voucher_path='voucher/test.png';
select is((select count(*) from public.booking_email_events where event='rejected'),1::bigint,'rejection queues once on status transition');
insert into public.payments(org_id,booking_id,amount_cents,currency,method,voucher_path)
select org_id,id,5000,currency,'yape','voucher/test2.png' from public.bookings where email_lang='en';
select is((select count(*) from public.booking_email_events where event='owner_voucher'),2::bigint,'second payment receives distinct voucher notification');
update public.bookings set status='confirmed',confirmed_at=now(),expires_at=null;
select is((select count(*) from public.booking_email_events where event='confirmed'),2::bigint,'confirmation queues guest notices in both orgs');

create temp table claims(payload jsonb);
insert into claims select public.cron_claim_booking_email(3) from generate_series(1,10);
select is((select count(*) from public.booking_email_events where attempted_at is null),0::bigint,'all claims durably consumed');
select is(public.cron_claim_booking_email(3),null,'later run cannot resend claims even if not settled');
select is((select count(distinct payload->>'id') from claims),9::bigint,'every event claimed once');
select ok(not exists(select 1 from claims where payload::text like '%public_token%'),'claims never contain guest capability');
select is((select payload->'recipients' from claims where payload->>'event'='received' and payload->>'lang'='en'),'["a@example.com"]'::jsonb,'guest recipient scoped to booking org');
select is((select payload->'recipients' from claims where payload->>'event'='owner_booking' and payload->>'lang'='en'),
  (select jsonb_agg(lower(email)) from auth.users where id='a3b45db1-7c15-4528-a4ba-be625665fb6d'), 'owner A only, no staff or owner B');
select is((select payload->'recipients' from claims where payload->>'event'='owner_booking' and payload->>'lang'='es'),
  (select jsonb_agg(lower(email)) from auth.users where id='bd6a1c86-01e2-40a4-ba79-4e28b373e880'), 'owner B only, no owner A');
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select throws_ok($$select * from public.booking_email_events$$,'42501',null,'owner A cannot read either org ledger');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select * from public.booking_email_events$$,'42501',null,'owner B cannot read either org ledger');
reset role;
select lives_ok($$select public.cron_settle_booking_email((select id from public.booking_email_events limit 1),'failed')$$,'failure records without touching booking');
select is((select count(*) from public.bookings where status='confirmed'),2::bigint,'email failures do not change reservations');
select throws_ok($$select public.cron_claim_booking_email(31)$$,'22023',null,'bounds arrival lead days');
-- Non-overlapping relative dates exercise the real Lima arrival window.
insert into public.quotes(org_id,property_id,unit_id,token,check_in,check_out,guests,currency,total_cents,deposit_cents,expires_at)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','ee204001-0000-4000-8000-000000000001',
repeat(k::text,64),(now() at time zone 'America/Lima')::date + offset_days,
(now() at time zone 'America/Lima')::date + offset_days + 1,2,'USD',10000,5000,now()+interval '1 day'
from (values (1,-1),(2,0),(3,1),(4,2),(5,3),(6,4)) f(k,offset_days);
select public.create_booking_from_quote(repeat(k::text,64),'Arrival Guest','arrival@example.com') from generate_series(1,6) k;
update public.bookings b set status='confirmed',confirmed_at=now(),expires_at=null from public.quotes q
 where q.id=b.quote_id and q.token in (repeat('1',64),repeat('2',64),repeat('4',64),repeat('5',64),repeat('6',64));
update public.bookings b set status='cancelled',cancelled_at=now() from public.quotes q where q.id=b.quote_id and q.token=repeat('4',64);
update public.booking_email_events set created_at=now()-interval '1 second' where attempted_at is null;
-- One claim generates arrival events, regardless of which pending event it returns.
select public.cron_claim_booking_email(3);
select is((select count(*) from public.booking_email_events where event='arrival'),2::bigint,'today and day X queued; past, pending, cancelled, day X+1 excluded');
select ok(exists(select 1 from public.booking_email_events e join public.bookings b on b.id=e.booking_id
 where e.event='arrival' and b.check_in=(now() at time zone 'America/Lima')::date),'late confirmation catches up on arrival day');
select public.cron_claim_booking_email(3);
select is((select count(*) from public.booking_email_events where event='arrival'),2::bigint,'daily repeat does not duplicate arrival events');
update public.bookings b set status='cancelled',cancelled_at=now() from public.quotes q where q.id=b.quote_id and q.token=repeat('5',64);
select public.cron_claim_booking_email(3) from generate_series(1,20);
select is((select outcome from public.booking_email_events e join public.bookings b on b.id=e.booking_id
 join public.quotes q on q.id=b.quote_id where e.event='arrival' and q.token=repeat('5',64)),'skipped','cancellation after enqueue suppresses instructions');
-- Retry state machine, immutable recipient snapshot and stale-attempt protection.
update public.booking_email_events set outcome='skipped' where outcome is null;
create temp table retry_event as select id from public.booking_email_events where event='owner_booking' limit 1;
update public.booking_email_events set outcome=null,attempted_at=null,first_attempt_at=null,attempts=0,recipients=null where id=(select id from retry_event);
create temp table retry_claims(payload jsonb);
insert into retry_claims select public.cron_claim_booking_email(3);
select is((select attempts from public.booking_email_events where id=(select id from retry_event)),1,'first attempt counted');
select public.cron_settle_booking_email((select id from retry_event),'retry',1);
select ok((select attempted_at is null and outcome is null from public.booking_email_events where id=(select id from retry_event)),'transient failure reopens event');
select is(public.cron_claim_booking_email(3),null,'retry waits for backoff (no immediate reclaim)');
update public.booking_email_events set retry_after=null where id=(select id from retry_event);
-- A changed membership must not shift the recipient associated with a provider key.
update public.memberships set role='staff';
insert into retry_claims select public.cron_claim_booking_email(3);
select is((select count(distinct payload->'recipients') from retry_claims),1::bigint,'retry keeps the same recipient snapshot');
select public.cron_settle_booking_email((select id from retry_event),'sent',1);
select ok((select outcome is null and attempted_at is not null from public.booking_email_events where id=(select id from retry_event)),'stale settlement cannot settle newer attempt');
select public.cron_settle_booking_email((select id from retry_event),'retry',2);
update public.booking_email_events set retry_after=null where id=(select id from retry_event);
select public.cron_claim_booking_email(3);
select public.cron_settle_booking_email((select id from retry_event),'retry',3);
select is((select outcome from public.booking_email_events where id=(select id from retry_event)),'failed','third transient failure is terminal');
select is(public.cron_claim_booking_email(3),null,'no fourth attempt');
update public.booking_email_events set outcome=null,attempted_at=null,first_attempt_at=null,attempts=0 where id=(select id from retry_event);
select public.cron_claim_booking_email(3);
update public.booking_email_events set attempted_at=clock_timestamp()-interval '29 minutes' where id=(select id from retry_event);
select is(public.cron_claim_booking_email(3),null,'active claim under 30 minutes is retained');
update public.booking_email_events set attempted_at=clock_timestamp()-interval '31 minutes' where id=(select id from retry_event);
select public.cron_claim_booking_email(3);
select is((select attempts from public.booking_email_events where id=(select id from retry_event)),2,'abandoned claim recovered after 30 minutes');
update public.booking_email_events set attempted_at=clock_timestamp()-interval '31 minutes' where id=(select id from retry_event);
select public.cron_claim_booking_email(3);
update public.booking_email_events set attempted_at=clock_timestamp()-interval '31 minutes' where id=(select id from retry_event);
select is(public.cron_claim_booking_email(3),null,'third abandoned attempt is not recovered');
select is((select outcome from public.booking_email_events where id=(select id from retry_event)),'failed','abandoned retry exhaustion marked failed');

-- Four distinct bookings in both organizations share a case-normalized email.
insert into public.quotes(org_id,property_id,unit_id,token,check_in,check_out,guests,currency,total_cents,deposit_cents,expires_at)
select case when k=4 then 'ff24bacc-47d2-40bc-9210-f860e98892fd'::uuid else 'bf88f504-051f-4fdc-ab73-4fa12d715817'::uuid end,
case when k=4 then '57f914ac-3890-47c1-9d6d-1492782cf712'::uuid else '131583b5-785e-4127-81f0-e097163c5654'::uuid end,
case when k=4 then 'ee204001-0000-4000-8000-000000000002'::uuid else 'ee204001-0000-4000-8000-000000000001'::uuid end,
md5('rate'||k)||md5('rate2'||k),'2040-01-01'::date+k*3,'2040-01-02'::date+k*3,2,
case when k=4 then 'PEN'::public.currency_code else 'USD'::public.currency_code end,10000,5000,now()+interval '1 day'
from generate_series(1,4) k;
select public.create_booking_from_quote(md5('rate'||k)||md5('rate2'||k),'Rate Guest',case when k%2=0 then 'RATE@EXAMPLE.COM' else 'rate@example.com' end) from generate_series(1,4) k;
create temp table rate_claims(payload jsonb);
insert into rate_claims select public.cron_claim_booking_email(3) from generate_series(1,8);
select is((select count(*) from rate_claims where payload->>'event'='received'),3::bigint,'maximum three received events per case-insensitive address across orgs');
select is((select count(*) from public.booking_email_events e join public.bookings b on b.id=e.booking_id
 join public.guests g on g.id=b.guest_id where e.event='received' and g.email='rate@example.com' and e.outcome='skipped'),1::bigint,'fourth received event skipped');
update public.booking_email_events set first_attempt_at=clock_timestamp()-interval '25 hours' where event='received';
update public.booking_email_events set attempted_at=null,outcome=null,first_attempt_at=null,attempts=0
where event='received' and outcome='skipped' and booking_id in (select b.id from public.bookings b join public.guests g on g.id=b.guest_id where g.email='rate@example.com');
select is(public.cron_claim_booking_email(3)->>'event','received','allowance resets outside rolling 24 hours');
update public.booking_email_events set outcome='skipped' where outcome is null;
-- Check both received and rejected after each terminal booking state.
insert into public.payments(org_id,booking_id,amount_cents,currency,method,status,reviewed_at)
select b.org_id,b.id,5000,b.currency,'yape','rejected',now() from public.bookings b join public.guests g on g.id=b.guest_id
where g.email='rate@example.com' limit 1;
update public.bookings set status='expired' where status='pending_payment';
update public.booking_email_events set attempted_at=null,outcome=null,attempts=0 where event in ('received','rejected') and booking_id in (select id from public.bookings where status='expired');
select public.cron_claim_booking_email(3) from generate_series(1,20);
select ok(not exists(select 1 from public.booking_email_events e join public.bookings b on b.id=e.booking_id where b.status='expired' and e.event in ('received','rejected') and e.outcome is distinct from 'skipped'),'received and rejected skipped for expired bookings');
update public.bookings set status='cancelled',cancelled_at=now() where status='confirmed';
update public.booking_email_events set attempted_at=null,outcome=null,attempts=0 where event in ('received','rejected') and booking_id in (select id from public.bookings where status='cancelled');
select public.cron_claim_booking_email(3) from generate_series(1,20);
select ok(not exists(select 1 from public.booking_email_events e join public.bookings b on b.id=e.booking_id where b.status='cancelled' and e.event in ('received','rejected') and e.outcome is distinct from 'skipped'),'received and rejected skipped for cancelled bookings');
select * from finish();
rollback;
