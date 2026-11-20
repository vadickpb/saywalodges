begin;
select no_plan();
-- Ids from supabase/seed.sql: Saywa org bf88f504-..., owner a3b45db1-..., staff c5d77e30-...; Demo org ff24bacc-..., owner bd6a1c86-...

select ok((select relrowsecurity from pg_class where oid = 'public.whatsapp_inbox'::regclass), 'inbox has RLS');
select ok(not has_table_privilege('authenticated', 'public.whatsapp_inbox', 'INSERT') and not has_table_privilege('authenticated', 'public.whatsapp_inbox', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.whatsapp_inbox', 'DELETE') and not has_table_privilege('anon', 'public.whatsapp_inbox', 'SELECT'),
  'only the server writes; anon reads nothing');
select ok(not has_function_privilege('anon', 'public.record_inbound_whatsapp(text,text,text,text,text,timestamptz,boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_inbound_whatsapp(text,text,text,text,text,timestamptz,boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.revoke_whatsapp_optins(text)', 'EXECUTE'), 'only the server records inbound messages and revokes consent');
select ok(has_function_privilege('service_role', 'public.record_inbound_whatsapp(text,text,text,text,text,timestamptz,boolean)', 'EXECUTE'), 'service role can record');

-- Isolation between organizations.
insert into public.whatsapp_inbox (org_id, wamid, from_phone, msg_type, body, received_at) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'wamid.A', '51999000001', 'text', 'hola A', now()),
  ('ff24bacc-47d2-40bc-9210-f860e98892fd', 'wamid.B', '51999000002', 'text', 'hola B', now());
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select is((select array_agg(wamid) from public.whatsapp_inbox), array['wamid.A'], 'owner A sees only A messages');
select lives_ok($$select public.mark_whatsapp_inbox_read('bf88f504-051f-4fdc-ab73-4fa12d715817')$$, 'a member marks the inbox read');
select throws_ok($$select public.mark_whatsapp_inbox_read('ff24bacc-47d2-40bc-9210-f860e98892fd')$$, '42501', 'not allowed', 'but not another organization''s');
reset role;
select ok((select read_at is not null from public.whatsapp_inbox where wamid = 'wamid.A'), 'A message marked read');
select ok((select read_at is null from public.whatsapp_inbox where wamid = 'wamid.B'), 'B message untouched');
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select is((select array_agg(wamid) from public.whatsapp_inbox), array['wamid.B'], 'owner B sees only B messages');
reset role;
delete from public.whatsapp_inbox;

-- Two organizations: a message cannot be attributed, nothing is stored.
select is(public.record_inbound_whatsapp('wamid.1', '51999111222', 'Ana', 'hola', 'text', now(), true) ->> 'status', 'no_org', 'with several organizations nothing is stored');
select is((select count(*) from public.whatsapp_inbox), 0::bigint, 'and nothing was written');

-- One organization (installation per client).
delete from public.organizations where id = 'ff24bacc-47d2-40bc-9210-f860e98892fd';
select throws_ok($$select public.record_inbound_whatsapp('wamid.x', 'abc', null, '', 'text', now(), true)$$, '22023', 'invalid input', 'invalid sender rejected');
select is(public.record_inbound_whatsapp('wamid.1', '51999111222', 'Ana', 'hola', 'text', now(), true) ->> 'reply', 'true', 'first message from a sender earns the auto-reply');
select is(public.record_inbound_whatsapp('wamid.1', '51999111222', 'Ana', 'hola', 'text', now(), true) ->> 'status', 'duplicate', 'Meta redelivery is a no-op');
select is(public.record_inbound_whatsapp('wamid.1', '51999111222', 'Ana', 'hola', 'text', now(), true) ->> 'reply', 'false', 'and never replies twice');
select is(public.record_inbound_whatsapp('wamid.2', '51999111222', 'Ana', 'otra', 'text', now(), true) ->> 'reply', 'false', 'a second message within 24 h gets no second reply');
select is(public.record_inbound_whatsapp('wamid.3', '51999333444', null, 'hi', 'text', now(), true) ->> 'reply', 'true', 'another sender gets their own reply');
select is(public.record_inbound_whatsapp('wamid.4', '51999555666', null, 'old', 'text', now() - interval '2 hours', true) ->> 'reply', 'false', 'a stale event is stored but never answered');
select is(public.record_inbound_whatsapp('wamid.5', '51999777888', null, 'stop', 'text', now(), false) ->> 'reply', 'false', 'caller says no reply: none');
select is((select count(*) from public.whatsapp_inbox), 5::bigint, 'every distinct message is stored once');
select is((select count(*) from public.whatsapp_inbox where auto_replied_at is not null), 2::bigint, 'exactly one auto-reply per answered sender');
update public.whatsapp_inbox set auto_replied_at = now() - interval '25 hours' where wamid = 'wamid.1';
select is(public.record_inbound_whatsapp('wamid.6', '51999111222', 'Ana', 'again', 'text', now(), true) ->> 'reply', 'true', 'a new 24 h window earns a new reply');
select is((select body from public.whatsapp_inbox where wamid = 'wamid.4'), 'old', 'body stored');
select is((select length(body) from public.whatsapp_inbox where wamid = 'wamid.7'), null, 'no row for unknown ids');
select is(public.record_inbound_whatsapp('wamid.8', '51999999999', null, repeat('x', 6000), 'text', now(), false) ->> 'status', 'stored', 'a very long body is truncated, not rejected');
select is((select length(body) from public.whatsapp_inbox where wamid = 'wamid.8'), 4096, 'at 4096 characters');

-- STOP withdraws consent for the bookings of that number (last 9 digits).
insert into public.quotes(org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at)
values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', repeat('a', 64), '2039-01-01', '2039-01-03', 2, 'USD', 10000, 5000, now() + interval '1 day');
set local role anon;
select lives_ok($$select public.create_checkout_booking(repeat('a', 64), 'Ana A', 'ana@example.com', '+51 999 888 777', 'es', true, 'v1')$$, 'booking with opt-in');
reset role;
select is(public.revoke_whatsapp_optins('51999000000'), 0, 'another number revokes nothing');
select is((select revoked_at is null from public.whatsapp_optins), true, 'consent untouched');
select is(public.revoke_whatsapp_optins('51999888777'), 1, 'STOP from the guest''s number revokes the consent');
select is((select revoked_at is not null from public.whatsapp_optins), true, 'revoked');
select is(public.revoke_whatsapp_optins('51999888777'), 0, 'idempotent');
select throws_ok($$select public.revoke_whatsapp_optins('x')$$, '22023', 'invalid input', 'invalid number rejected');

-- Retention.
update public.whatsapp_inbox set received_at = now() - interval '400 days' where wamid = 'wamid.2';
select is(public.cron_purge_whatsapp(365) ->> 'inbox', '1', 'old inbox messages are purged');
select is((select count(*) from public.whatsapp_inbox where wamid = 'wamid.2'), 0::bigint, 'and gone');

select * from finish();
rollback;
