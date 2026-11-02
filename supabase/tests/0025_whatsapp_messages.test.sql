-- SD-1008: whatsapp_messages ledger and its two service_role RPCs.
-- Ids from supabase/seed.sql: org Saywa bf88f504-...
begin;
select plan(25);

-- ─── Catalog and grants ─────────────────────────────────────────────────────
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'public.log_whatsapp_message(uuid,text,text,text,text,uuid)'::regprocedure,
  'public.record_whatsapp_status(text,text,timestamptz,text)'::regprocedure)),
  'both RPCs are SECURITY DEFINER with an empty search_path');
select ok(not has_function_privilege('anon', 'public.log_whatsapp_message(uuid,text,text,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.log_whatsapp_message(uuid,text,text,text,text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_whatsapp_status(text,text,timestamptz,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_whatsapp_status(text,text,timestamptz,text)', 'EXECUTE'),
  'anon and authenticated cannot execute either RPC');
select ok(has_function_privilege('service_role', 'public.log_whatsapp_message(uuid,text,text,text,text,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.record_whatsapp_status(text,text,timestamptz,text)', 'EXECUTE'),
  'service_role can execute both');
select ok((select relrowsecurity from pg_class where oid = 'public.whatsapp_messages'::regclass), 'RLS is enabled');
select ok(not has_table_privilege('anon', 'public.whatsapp_messages', 'SELECT')
  and not has_table_privilege('authenticated', 'public.whatsapp_messages', 'SELECT')
  and not has_table_privilege('authenticated', 'public.whatsapp_messages', 'INSERT'),
  'anon and authenticated have no table access');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'whatsapp_messages'
  and column_name ~* '(phone|number|recipient|to_|msisdn|name|email)'),
  'no column can hold the recipient (privacy by construction)');

-- ─── Logging ────────────────────────────────────────────────────────────────
create temp table ids as
  select public.log_whatsapp_message('bf88f504-051f-4fdc-ab73-4fa12d715817', 'booking_confirmed', 'es', 'wamid.AAA', 'live', null) as id;
select ok((select id is not null from ids), 'a message is logged');
select is((select status from public.whatsapp_messages where wamid = 'wamid.AAA'), 'sent', 'it starts as sent');
select is(public.log_whatsapp_message('bf88f504-051f-4fdc-ab73-4fa12d715817', 'booking_confirmed', 'es', 'wamid.AAA', 'live', null),
  (select id from ids), 'logging the same wamid again returns the same row');
select is((select count(*)::int from public.whatsapp_messages where wamid = 'wamid.AAA'), 1, '... and does not duplicate it');
select throws_ok($$select public.log_whatsapp_message('ff24bacc-47d2-40bc-9210-f860e98892fd', 'booking_confirmed', 'es', 'wamid.AAA', 'live', null)$$,
  '23505', null, 'a wamid already recorded for another organization is refused, not merged');
select throws_ok($$select public.log_whatsapp_message('bf88f504-051f-4fdc-ab73-4fa12d715817', 'booking_confirmed', 'es', 'wamid.BAD', 'live', gen_random_uuid())$$,
  '23503', null, 'a booking that does not exist (or is from another org) is refused');
select throws_ok($$select public.log_whatsapp_message('bf88f504-051f-4fdc-ab73-4fa12d715817', 'Bad Template!', 'es', 'wamid.BAD2', 'live', null)$$,
  '23514', null, 'a malformed template name is refused');

-- ─── Status only moves forward ──────────────────────────────────────────────
select is(public.record_whatsapp_status('wamid.AAA', 'delivered', now(), null), 'updated', 'sent → delivered');
select is(public.record_whatsapp_status('wamid.AAA', 'delivered', now(), null), 'ignored', 'the same event again changes nothing (duplicate)');
select is(public.record_whatsapp_status('wamid.AAA', 'read', now(), null), 'updated', 'delivered → read');
select is(public.record_whatsapp_status('wamid.AAA', 'delivered', now(), null), 'ignored', 'a late delivered after read is ignored (out of order)');
select is(public.record_whatsapp_status('wamid.AAA', 'failed', now(), '131026'), 'ignored', 'failed never overwrites a delivered message');
select is((select status from public.whatsapp_messages where wamid = 'wamid.AAA'), 'read', 'the message is still read');

-- failed only replaces sent, and keeps the error code
select public.log_whatsapp_message('bf88f504-051f-4fdc-ab73-4fa12d715817', 'booking_confirmed', 'es', 'wamid.BBB', 'live', null);
select is(public.record_whatsapp_status('wamid.BBB', 'failed', now(), '131026'), 'updated', 'sent → failed');
select is((select error_code from public.whatsapp_messages where wamid = 'wamid.BBB'), '131026', 'the error code is kept');

-- A repeated 'sent', and anything arriving after 'failed', changes nothing
select is(public.record_whatsapp_status('wamid.BBB', 'sent', now(), null), 'ignored', 'a late sent after failed is ignored');
select is(public.record_whatsapp_status('wamid.BBB', 'read', now(), null), 'ignored', 'nothing moves a failed message forward');

-- ─── Unknown and invalid input ──────────────────────────────────────────────
select is(public.record_whatsapp_status('wamid.NOPE', 'delivered', now(), null), 'unknown', 'an unknown wamid is reported, not an error');
select throws_ok($$select public.record_whatsapp_status('wamid.AAA', 'deleted', now(), null)$$, '22023', null, 'an unsupported status is refused');

select * from finish();
rollback;
