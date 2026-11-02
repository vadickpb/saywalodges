-- SD-403. Seed tenant/unit ids; all fixtures roll back. No remote DB access.
begin;
select no_plan();
select ok(has_function_privilege('anon', 'public.get_quote_checkout(text,text)', 'EXECUTE'), 'anon may read checkout');
select ok(has_function_privilege('authenticated', 'public.get_quote_checkout(text,text)', 'EXECUTE'), 'authenticated may read checkout');
select ok(not has_function_privilege('service_role', 'public.get_quote_checkout(text,text)', 'EXECUTE'), 'service_role has no checkout grant');
select ok(not exists (
  select 1 from pg_proc p, lateral aclexplode(p.proacl) a
  where p.oid = 'public.get_quote_checkout(text,text)'::regprocedure and a.grantee = 0
), 'PUBLIC has no privileges');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
  where oid = 'public.get_quote_checkout(text,text)'::regprocedure), 'definer uses empty search_path');
select ok(not has_table_privilege('anon', 'public.quotes', 'SELECT'), 'anon cannot read quotes');
select ok(not has_table_privilege('anon', 'public.guests', 'SELECT'), 'anon cannot read guest PII');
select ok(not has_function_privilege('anon', 'public.expire_holds()', 'EXECUTE'), 'anon cannot sweep holds');

insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests,
  currency, total_cents, deposit_cents, breakdown, created_at, expires_at)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', repeat(k,64), '2035-01-10', '2035-01-12', 2,
  'USD', 44000, 22000, '{"total_cents":1,"guest_email":"secret@example.com","name":"<script>secret</script>"}',
  now() - interval '2 days', case when k = 'e' then now() - interval '1 day' else now() + interval '1 day' end
from unnest(array['a','b','e']) k;
insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests,
  currency, total_cents, deposit_cents, expires_at)
values ('ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712',
  'ee204001-0000-4000-8000-000000000002', repeat('d',64), '2035-01-10', '2035-01-12', 2,
  'PEN', 10000, 5000, now() + interval '1 day');
update public.properties set custom_domain = 'checkout.example.com' where subdomain = 'saywa-lodges';
create temp table results (k text primary key, payload jsonb);
grant select, insert on results to anon;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
insert into results values ('quote', public.get_quote_checkout('saywa-lodges', repeat('a',64)));
select is((select payload->>'total_cents' from results where k='quote'), '44000', 'total is from column, never breakdown');
select is((select payload->>'balance_cents' from results where k='quote'), '22000', 'balance is from columns');
select is((select array_agg(key order by key) from results, lateral jsonb_object_keys(payload) key where k='quote'),
  array['balance_cents','check_in','check_out','currency','deposit_cents','expires_at','guests','hold_minutes','property_name','total_cents','unit_name'],
  'exact closed response keys: no ids, org, created_by, token, breakdown or PII');
select ok((select payload::text !~ 'secret|script' from results where k='quote'), 'untrusted breakdown does not escape');
select is(public.get_quote_checkout('demo',repeat('a',64)), null, 'Saywa token under Demo host is hidden');
select is(public.get_quote_checkout('saywa-lodges',repeat('d',64)), null, 'Demo token under Saywa host is hidden');
select is(public.get_quote_checkout('demo',repeat('d',64))->>'currency', 'PEN', 'second tenant can read its quote');
select is(public.get_quote_checkout('checkout.example.com',repeat('a',64)), (select payload from results where k='quote'), 'custom domain matches');
select is(public.get_quote_checkout('SAYWA-LODGES',repeat('a',64)), (select payload from results where k='quote'), 'host is case insensitive');
select is(public.get_quote_checkout('saywa-lodges',repeat('e',64)), null, 'expired quote hidden');
select is(public.get_quote_checkout('saywa-lodges','malformed'), null, 'malformed token hidden');
select is(public.get_quote_checkout('saywa-lodges',repeat('A',64)), null, 'uppercase token hidden');
select is(public.get_quote_checkout('saywa-lodges',repeat('a',65)), null, 'overlong token hidden');
select is(public.get_quote_checkout('saywa-lodges',repeat('f',64)), null, 'nonexistent token hidden');
select is(public.get_quote_checkout('',repeat('a',64)), null, 'empty host hidden');
select is(public.get_quote_checkout(null,repeat('a',64)), null, 'null host hidden');
select is(public.get_quote_checkout('saywa-lodges',null), null, 'null token hidden');
select is(public.get_quote_checkout('other.example.com',repeat('a',64)), null, 'unknown host hidden');
select throws_ok($$select public.create_booking_from_quote(repeat('e',64),'Guest','guest@example.com')$$,
  'SD001', null, 'conversion still rejects expired quotes');
select throws_ok($$select public.create_booking_from_quote(repeat('a',64),E'Guest\nName','control@example.com')$$,
  '22023', null, 'direct anon call rejects a newline in name');
select throws_ok($$select public.create_booking_from_quote(repeat('a',64),U&'Guest\202eName','control@example.com')$$,
  '22023', null, 'direct anon call rejects text direction override');
select throws_ok($$select public.create_booking_from_quote(repeat('a',64),U&'Guest\200eName','control@example.com')$$,
  '22023', null, 'direct anon call rejects direction mark');
select throws_ok($$select public.create_booking_from_quote(repeat('a',64),U&'Guest\2066Name','control@example.com')$$,
  '22023', null, 'direct anon call rejects directional isolate');
select throws_ok($$select public.create_booking_from_quote(repeat('a',64),U&'Guest\+0e0001Name','control@example.com')$$,
  '22023', null, 'direct anon call rejects supplementary Unicode format characters');
reset role;
select is((select count(*)::int from public.guests where email='control@example.com'), 0, 'invalid names do not create guests');
set local role anon;
insert into results values ('first', public.create_booking_from_quote(repeat('a',64),'María Muñoz','guest@example.com','+51 999000111'));
insert into results values ('replay', public.create_booking_from_quote(repeat('a',64),'Different Guest','other@example.com',null));
select is((select payload->>'replayed' from results where k='first'), 'false', 'normal accented name creates booking');
select is((select payload->>'replayed' from results where k='replay'), 'true', 'second call replays');
select is((select payload->>'booking_id' from results where k='first'), (select payload->>'booking_id' from results where k='replay'), 'double send returns same booking');
select matches((select payload->>'public_token' from results where k='first'), '^[a-f0-9]{64}$', 'new booking returns public token');
select is((select payload->>'public_token' from results where k='first'), (select payload->>'public_token' from results where k='replay'), 'replay returns same public token');
select is(public.get_booking_status('saywa-lodges',(select payload->>'public_token' from results where k='first'))->>'status',
  'pending_payment', 'returned capability opens existing status RPC');
select is(public.get_quote_checkout('saywa-lodges',repeat('a',64)),
  jsonb_build_object('public_token',(select payload->>'public_token' from results where k='first')), 'converted quote exposes only redirect capability');
select throws_ok($$select public.create_booking_from_quote(repeat('b',64),'Guest','guest@example.com')$$,
  '23P01', null, 'overlapping quote still rejected by exclusion constraint');
select is(public.get_quote_checkout('demo',repeat('a',64)), null, 'converted quote remains scoped to its host');
reset role;
select is((select total_cents from public.bookings where id=(select (payload->>'booking_id')::uuid from results where k='first')), 44000, 'booking copies stored quote total');
select is((select count(*)::int from public.calendar_blocks where booking_id=(select (payload->>'booking_id')::uuid from results where k='first')), 1, 'double send creates one hold');
select is((select count(*)::int from public.bookings where quote_id = (select id from public.quotes where token=repeat('a',64))), 1, 'only one booking exists');
select is((select count(*)::int from public.guests where email='other@example.com'), 0, 'replay does not create a second guest');
-- Expiry after conversion must still allow resuming the existing booking.
update public.quotes set expires_at=now()-interval '1 hour' where token=repeat('a',64);
set local role anon;
select ok(public.get_quote_checkout('saywa-lodges',repeat('a',64)) ? 'public_token', 'converted quote redirects after expiry');
reset role;
update public.properties set published=false where subdomain='saywa-lodges';
set local role anon;
select is(public.get_quote_checkout('saywa-lodges',repeat('b',64)), null, 'unpublished property hides open quote');
select is(public.get_quote_checkout('saywa-lodges',repeat('a',64)), null, 'unpublished property hides converted quote');
select throws_ok($$select public.create_booking_from_quote(repeat('b',64),'Unpublished Guest','unpublished@example.com')$$,
  '22023', null, 'direct anon call cannot convert an unpublished property quote');
select is(public.create_booking_from_quote(repeat('a',64),'Replay Guest','replay-unpublished@example.com')->>'public_token',
  (select payload->>'public_token' from results where k='first'), 'direct replay still returns original booking after unpublishing');
reset role;
select is((select count(*)::int from public.bookings where quote_id=(select id from public.quotes where token=repeat('b',64))), 0,
  'unpublished conversion creates no booking');
select is((select count(*)::int from public.guests where email in ('unpublished@example.com','replay-unpublished@example.com')), 0,
  'unpublished conversion and replay create no guests');
select is((select count(*)::int from public.calendar_blocks where unit_id='ee204001-0000-4000-8000-000000000001' and source='booking'), 1,
  'unpublished conversion creates no additional calendar block');
select is((select name from public.guests where email='guest@example.com'), 'María Muñoz', 'replay ignores replacement guest name');
select * from finish();
rollback;
