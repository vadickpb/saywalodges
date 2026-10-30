-- SD-408: bookings.public_token, get_booking_status (guest status page) and hold expiration.
-- Ids from supabase/seed.sql: Saywa org bf88f504-..., property 131583b5-... (subdomain saywa-lodges),
-- unit ee204001-...0001; Demo org ff24bacc-..., property 57f914ac-... (subdomain demo), unit ...0002.
begin;
select plan(42);

-- ─── Catalog ────────────────────────────────────────────────────────────────
select col_not_null('public', 'bookings', 'public_token', 'bookings.public_token is NOT NULL');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.bookings'::regclass and conname = 'bookings_public_token_key' and contype = 'u'),
  'public_token is unique');
select ok(not has_table_privilege('anon', 'public.bookings', 'SELECT'), 'anon still cannot SELECT bookings');
select ok(not has_column_privilege('anon', 'public.bookings', 'public_token', 'SELECT'), 'anon cannot read public_token by column either');
select ok(has_function_privilege('anon', 'public.get_booking_status(text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_booking_status(text,text)', 'EXECUTE'),
  'anon and authenticated can execute get_booking_status');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.get_booking_status(text,text)'::regprocedure),
  'get_booking_status is SECURITY DEFINER with an empty search_path');

-- ─── Fixtures (table owner) ─────────────────────────────────────────────────
insert into public.guests (id, org_id, name, email, phone) values
  ('91000000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'Ana Secret', 'ana.secret@example.com', '+51 999 000 111'),
  ('91000000-0000-4000-8000-000000000002', 'ff24bacc-47d2-40bc-9210-f860e98892fd', 'Dan Demo', 'dan@example.com', null);

create temp table fx (k text primary key, quote_id uuid, booking_id uuid, token text);
insert into fx values
  ('a', '92000000-0000-4000-8000-00000000000a', '93000000-0000-4000-8000-00000000000a', repeat('a', 64)),
  ('b', '92000000-0000-4000-8000-00000000000b', '93000000-0000-4000-8000-00000000000b', repeat('b', 64)),
  ('c', '92000000-0000-4000-8000-00000000000c', '93000000-0000-4000-8000-00000000000c', repeat('c', 64)),
  ('d', '92000000-0000-4000-8000-00000000000d', '93000000-0000-4000-8000-00000000000d', repeat('d', 64)),
  ('e', '92000000-0000-4000-8000-00000000000e', '93000000-0000-4000-8000-00000000000e', repeat('e', 64)),
  ('f', '92000000-0000-4000-8000-00000000000f', '93000000-0000-4000-8000-00000000000f', repeat('f', 64));
grant all on fx to anon, authenticated, service_role;

insert into public.quotes (id, org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at, created_at)
select fx.quote_id,
  case when k = 'f' then 'ff24bacc-47d2-40bc-9210-f860e98892fd'::uuid else 'bf88f504-051f-4fdc-ab73-4fa12d715817'::uuid end,
  case when k = 'f' then '57f914ac-3890-47c1-9d6d-1492782cf712'::uuid else '131583b5-785e-4127-81f0-e097163c5654'::uuid end,
  case when k = 'f' then 'ee204001-0000-4000-8000-000000000002'::uuid else 'ee204001-0000-4000-8000-000000000001'::uuid end,
  rpad('sq' || k, 40, 'x'),
  case k when 'a' then '2027-08-10' when 'b' then '2027-09-01' when 'c' then '2027-10-01' when 'd' then '2027-11-01' when 'e' then '2027-12-01' else '2027-08-10' end::date,
  case k when 'a' then '2027-08-13' when 'b' then '2027-09-03' when 'c' then '2027-10-03' when 'd' then '2027-11-03' when 'e' then '2027-12-03' else '2027-08-13' end::date,
  2, case when k = 'f' then 'PEN' else 'USD' end::public.currency_code, 44000, 22000, now() + interval '1 day', now()
from fx;

insert into public.bookings (id, org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out, guests, currency,
  total_cents, deposit_cents, status, expires_at, confirmed_at, public_token)
select fx.booking_id, q.org_id, q.property_id, q.unit_id,
  case when k = 'f' then '91000000-0000-4000-8000-000000000002'::uuid else '91000000-0000-4000-8000-000000000001'::uuid end,
  q.id, q.check_in, q.check_out, q.guests, q.currency, q.total_cents, q.deposit_cents,
  case when k = 'e' then 'confirmed' else 'pending_payment' end::public.booking_status,
  case k when 'a' then now() + interval '1 hour' when 'b' then now() - interval '1 hour' when 'c' then now() - interval '1 hour'
         when 'd' then now() + interval '1 hour' when 'e' then null else now() + interval '1 hour' end,
  case when k = 'e' then now() end,
  fx.token
from fx join public.quotes q on q.id = fx.quote_id;

insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id, expires_at)
select b.org_id, b.property_id, b.unit_id, daterange(b.check_in, b.check_out, '[)'), 'booking', b.id, b.expires_at
from public.bookings b where b.id in (select booking_id from fx);

insert into public.payments (org_id, booking_id, amount_cents, currency, method, status, reviewed_at)
values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '93000000-0000-4000-8000-00000000000c', 22000, 'USD', 'yape', 'pending_review', null),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '93000000-0000-4000-8000-00000000000d', 10000, 'USD', 'yape', 'rejected', now());

select is((select count(*)::int from public.bookings where public_token !~ '^[a-f0-9]{64}$'), 0, 'Every booking has a 64-hex token');
select is((select count(distinct public_token)::int from public.bookings), (select count(*)::int from public.bookings), 'Tokens are distinct');

-- Token immutability and shape.
select throws_ok($$update public.bookings set public_token = repeat('1', 64) where id = '93000000-0000-4000-8000-00000000000a'$$,
  '55000', null, 'A token can never be rewritten');
select throws_ok($$insert into public.bookings (org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at, public_token)
  select org_id, property_id, unit_id, guest_id, quote_id, '2028-02-01', '2028-02-02', 1, currency, 1, 1, now() + interval '1 hour', repeat('a', 64) from public.bookings where id = '93000000-0000-4000-8000-00000000000a'$$,
  '23505', null, 'Duplicate tokens are rejected');
select throws_ok($$insert into public.bookings (org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at, public_token)
  select org_id, property_id, unit_id, guest_id, quote_id, '2028-02-01', '2028-02-02', 1, currency, 1, 1, now() + interval '1 hour', 'short' from public.bookings where id = '93000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'Malformed tokens are rejected by the check constraint');

-- ─── anon reads through the RPC only ────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select 1 from public.bookings$$, '42501', null, 'anon cannot select bookings directly');

select is(public.get_booking_status('saywa-lodges', repeat('a', 64))->>'status', 'pending_payment', 'Valid host + token returns the status');
select is(public.get_booking_status('saywa-lodges', repeat('a', 64))->>'property_name', (select name from public.properties where id = '131583b5-785e-4127-81f0-e097163c5654'), 'It returns the property name');
select is(public.get_booking_status('SAYWA-Lodges', repeat('a', 64))->>'status', 'pending_payment', 'Host matching is case-insensitive');
select is(public.get_booking_status('saywa-lodges', repeat('a', 64))->>'hold_lapsed', 'false', 'A running hold is not lapsed');
select is(public.get_booking_status('saywa-lodges', repeat('a', 64))->>'voucher', 'none', 'No voucher yet');
select ok(not (public.get_booking_status('saywa-lodges', repeat('a', 64)) ?| array[
    'id', 'booking_id', 'org_id', 'property_id', 'unit_id', 'guest_id', 'quote_id', 'public_token',
    'guest_name', 'guest_email', 'guest_phone', 'name', 'email', 'phone', 'reference', 'voucher_path']),
  'The snapshot carries no ids, token echo or guest PII');
select ok(public.get_booking_status('saywa-lodges', repeat('a', 64))::text !~* 'ana\.secret|Ana Secret|999 000',
  'No guest data appears anywhere in the payload');

select is(public.get_booking_status('demo', repeat('a', 64)), null, 'A Saywa token under the Demo host is not found (no cross-tenant read)');
select is(public.get_booking_status('saywa-lodges', repeat('f', 64)), null, 'A Demo token under the Saywa host is not found');
select is(public.get_booking_status('demo', repeat('f', 64))->>'status', 'pending_payment', 'A Demo token works under the Demo host');
select is(public.get_booking_status('unknown-host', repeat('a', 64)), null, 'Unknown host is not found');
select is(public.get_booking_status('', repeat('a', 64)), null, 'Empty host is not found');
select is(public.get_booking_status(null, repeat('a', 64)), null, 'Null host is not found');
select is(public.get_booking_status('saywa-lodges', repeat('9', 64)), null, 'Unknown token is not found');
select is(public.get_booking_status('saywa-lodges', null), null, 'Null token is not found');
select is(public.get_booking_status('saywa-lodges', upper(repeat('a', 64))), null, 'Wrong-case token is not found');
select is(public.get_booking_status('saywa-lodges', repeat('a', 63)), null, 'Short token is not found');
select is(public.get_booking_status('saywa-lodges', quote_literal('x') || repeat('a', 55) || ' or 1=1'), null, 'Injection-looking token is not found');
select is(public.get_booking_status('saywa-lodges', rpad('sqa', 40, 'x')), null, 'A quote token is not a booking token');

select is(public.get_booking_status('saywa-lodges', repeat('b', 64))->>'hold_lapsed', 'true', 'A lapsed, unswept hold is flagged');
select is(public.get_booking_status('saywa-lodges', repeat('c', 64))->>'voucher', 'under_review', 'A voucher under review is reported');
select is(public.get_booking_status('saywa-lodges', repeat('d', 64))->>'voucher', 'rejected', 'A rejected voucher is reported');
reset role;

-- Unpublished property hides its bookings.
update public.properties set published = false where id = '131583b5-785e-4127-81f0-e097163c5654';
set local role anon;
select is(public.get_booking_status('saywa-lodges', repeat('a', 64)), null, 'An unpublished property exposes nothing');
reset role;
update public.properties set published = true where id = '131583b5-785e-4127-81f0-e097163c5654';

-- ─── Hold expiration (service_role, as the cron route does) ─────────────────
set local role service_role;
select is(public.expire_holds(), 1, 'expire_holds expires only the lapsed hold without a voucher under review');
select is(public.expire_holds(), 0, 'A second sweep is a no-op');
reset role;

select is((select string_agg(k || ':' || b.status::text, ',' order by k) from fx join public.bookings b on b.id = fx.booking_id),
  'a:pending_payment,b:expired,c:pending_payment,d:pending_payment,e:confirmed,f:pending_payment',
  'Only B expired; the voucher-in-review, running, confirmed and other-tenant bookings are untouched');
select is((select count(*)::int from public.calendar_blocks where booking_id = '93000000-0000-4000-8000-00000000000b'), 0, 'The expired booking freed its dates');
select is((select count(*)::int from public.calendar_blocks where booking_id in (select booking_id from fx where k <> 'b')), 5, 'The other bookings keep their blocks');

set local role anon;
select is(public.get_booking_status('saywa-lodges', repeat('b', 64))->>'status', 'expired', 'The status page now reports expired');
reset role;

-- The freed dates can be booked again (the exclusion constraint no longer blocks them).
select lives_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', daterange('2027-09-01', '2027-09-03', '[)'), 'manual', 'reused')$$,
  'The released dates are free again');

select * from finish();
rollback;
