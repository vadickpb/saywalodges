-- SD-401: guests, quotes, bookings, payments, payment accounts and their RPCs.
-- Ids from supabase/seed.sql:
--   orgs  Saywa bf88f504-..., Demo ff24bacc-...
--   users Saywa owner a3b45db1-..., Saywa staff c5d77e30-..., Demo owner bd6a1c86-...
--   units Saywa ee204001-...0001 (property 131583b5-..., USD), Demo ee204001-...0002 (property 57f914ac-..., PEN)
-- Real two-session concurrency is covered by create_booking_from_quote's row/exclusion locks
-- (same mechanism as 0014); here replays and conflicts are asserted within one session.
begin;
select plan(109);

-- ─── Catalog: RLS, privileges, definer hygiene ──────────────────────────────
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.guests'::regclass, 'public.quotes'::regclass, 'public.bookings'::regclass,
  'public.payments'::regclass, 'public.property_payment_accounts'::regclass)),
  'All five new tables have RLS enabled');
select ok(not exists (select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon'
    and table_name in ('guests', 'quotes', 'bookings', 'payments', 'property_payment_accounts')),
  'anon has no privilege at all on the new tables (guest PII, account numbers)');
select ok(not exists (select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    and table_name in ('guests', 'quotes', 'bookings', 'payments')),
  'authenticated has no write privilege on guests/quotes/bookings/payments');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'public.create_booking_from_quote(text,text,text,text)'::regprocedure,
  'public.confirm_payment(uuid,uuid)'::regprocedure, 'public.reject_payment(uuid,uuid,text)'::regprocedure,
  'public.cancel_booking(uuid,uuid,text)'::regprocedure, 'public.expire_holds()'::regprocedure,
  'private.release_expired_holds(uuid)'::regprocedure)),
  'Every SD-401 function is SECURITY DEFINER with an empty search_path');
select ok(has_function_privilege('anon', 'public.create_booking_from_quote(text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.confirm_payment(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reject_payment(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cancel_booking(uuid,uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.expire_holds()', 'EXECUTE'),
  'anon can only execute create_booking_from_quote');
select ok(has_function_privilege('service_role', 'public.expire_holds()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.expire_holds()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.release_expired_holds(uuid)', 'EXECUTE'),
  'expire_holds is for service_role (cron) only');

-- ─── Fixtures (table owner) ─────────────────────────────────────────────────
insert into public.quotes (id, org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
  total_cents, deposit_cents, expires_at, created_at) values
  ('90000000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q1', 40, 'x'), '2027-08-10', '2027-08-13', 4, 'USD', 66000, 33000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q2', 40, 'x'), '2027-08-11', '2027-08-14', 2, 'USD', 44000, 22000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000003', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q3', 40, 'x'), '2027-09-20', '2027-09-22', 2, 'USD', 44000, 22000, now() - interval '1 hour', now() - interval '2 hours'),
  ('90000000-0000-4000-8000-000000000004', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q4', 40, 'x'), '2027-08-13', '2027-08-15', 3, 'USD', 44000, 22000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000005', 'ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712',
   'ee204001-0000-4000-8000-000000000002', rpad('q5', 40, 'x'), '2027-08-10', '2027-08-13', 2, 'PEN', 30000, 15000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000006', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q6', 40, 'x'), '2027-09-01', '2027-09-03', 2, 'USD', 44000, 22000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000007', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q7', 40, 'x'), '2027-09-01', '2027-09-03', 2, 'USD', 44000, 22000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000008', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q8', 40, 'x'), '2027-10-01', '2027-10-03', 2, 'USD', 44000, 22000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000009', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q9', 40, 'x'), '2027-10-01', '2027-10-03', 2, 'USD', 44000, 22000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000010', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q10', 40, 'x'), '2027-11-01', '2027-11-03', 14, 'USD', 44000, 22000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000011', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q11', 40, 'x'), '2027-12-01', '2027-12-03', 2, 'PEN', 44000, 22000, now() + interval '1 day', now()),
  ('90000000-0000-4000-8000-000000000012', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
   'ee204001-0000-4000-8000-000000000001', rpad('q12', 40, 'x'), '2028-01-10', '2028-01-12', 2, 'USD', 44000, 22000, now() + interval '1 day', now());

select throws_ok($$insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000002',
  rpad('bad', 40, 'x'), '2027-01-01', '2027-01-02', 1, 'USD', 1, 1, now() + interval '1 day')$$,
  '23503', null, 'A quote cannot point to a unit of another organization/property');
select throws_ok($$insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency, total_cents, deposit_cents, expires_at)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
  rpad('bad', 40, 'x'), '2027-01-01', '2027-01-02', 1, 'USD', 100, 101, now() + interval '1 day')$$,
  '23514', null, 'A deposit above the total is rejected');

-- ─── anon: create_booking_from_quote, happy path and replays ────────────────
create temp table res (k text primary key, v jsonb);
grant all on res to anon, authenticated, service_role;

set local role anon;
select set_config('request.jwt.claims', '{}', true);

select lives_ok($$insert into res select 'b1', public.create_booking_from_quote(rpad('q1', 40, 'x'), '  Ana Guest ', 'ANA@Example.com ', '+51 999 111 222')$$,
  'anon creates a booking from a valid quote');
select throws_ok($$select * from public.guests$$, '42501', null, 'anon cannot read guests');
select throws_ok($$select * from public.bookings$$, '42501', null, 'anon cannot read bookings');
select throws_ok($$select * from public.quotes$$, '42501', null, 'anon cannot read quotes');
select throws_ok($$select * from public.payments$$, '42501', null, 'anon cannot read payments');
select throws_ok($$select * from public.property_payment_accounts$$, '42501', null, 'anon cannot read payment accounts');
select throws_ok($$insert into public.bookings (org_id) values ('bf88f504-051f-4fdc-ab73-4fa12d715817')$$, '42501', null,
  'anon cannot insert bookings directly');
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', gen_random_uuid())$$,
  '42501', null, 'anon cannot execute confirm_payment');
select throws_ok($$select public.expire_holds()$$, '42501', null, 'anon cannot execute expire_holds');
reset role;

select is((select v->>'status' from res where k = 'b1'), 'pending_payment', 'The new booking is pending_payment');
select is((select v->>'replayed' from res where k = 'b1'), 'false', 'The first call is not a replay');
select results_eq($$select b.total_cents, b.deposit_cents, b.currency::text, b.check_in::text, b.check_out::text, b.guests, b.status::text
    from public.bookings b where b.id = (select (v->>'booking_id')::uuid from res where k = 'b1')$$,
  $$values (66000, 33000, 'USD'::text, '2027-08-10'::text, '2027-08-13'::text, 4, 'pending_payment'::text)$$,
  'Amounts, currency, dates and guests are copied from the stored quote');
select results_eq($$select g.name, g.email, g.phone from public.guests g where g.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'$$,
  $$values ('Ana Guest'::text, 'ana@example.com'::text, '+51 999 111 222'::text)$$,
  'The guest is stored trimmed with a normalized email');
select results_eq($$select cb.period::text, cb.source::text, (cb.expires_at is not null) from public.calendar_blocks cb
    where cb.booking_id = (select (v->>'booking_id')::uuid from res where k = 'b1')$$,
  $$values ('[2027-08-10,2027-08-13)'::text, 'booking'::text, true)$$,
  'A booking block with an expiry occupies [check_in, check_out)');
select ok((select expires_at = (select expires_at from public.calendar_blocks where booking_id = b.id)
    and expires_at = now() + interval '120 minutes' from public.bookings b where b.id = (select (v->>'booking_id')::uuid from res where k = 'b1')),
  'The hold lasts the property default (120 minutes) and booking/block expire together');

set local role anon;
insert into res select 'b1r', public.create_booking_from_quote(rpad('q1', 40, 'x'), 'Someone Else', 'other@example.com', null);
reset role;
select is((select v->>'booking_id' from res where k = 'b1r'), (select v->>'booking_id' from res where k = 'b1'),
  'Replaying the same quote returns the same booking (idempotent)');
select is((select v->>'replayed' from res where k = 'b1r'), 'true', 'The replay is flagged');
select is((select count(*)::int from public.bookings where quote_id = '90000000-0000-4000-8000-000000000001'), 1, 'Still one booking for the quote');
select is((select count(*)::int from public.calendar_blocks where booking_id = (select (v->>'booking_id')::uuid from res where k = 'b1')), 1,
  'Still one block after the replay');
select is((select count(*)::int from public.guests where email = 'other@example.com'), 0, 'A replay creates no second guest');

-- ─── Rejections ─────────────────────────────────────────────────────────────
set local role anon;
select throws_ok($$select public.create_booking_from_quote(rpad('q2', 40, 'x'), 'Bea', 'bea@example.com')$$,
  '23P01', null, 'Occupied dates are rejected by the exclusion constraint');
select throws_ok($$select public.create_booking_from_quote(rpad('q3', 40, 'x'), 'Cy', 'cy@example.com')$$,
  'SD001', null, 'An expired quote is rejected');
select throws_ok($$select public.create_booking_from_quote(rpad('nope', 40, 'x'), 'Cy', 'cy@example.com')$$,
  'P0002', null, 'An unknown token is rejected');
select throws_ok($$select public.create_booking_from_quote('short', 'Cy', 'cy@example.com')$$,
  'P0002', null, 'A malformed token is rejected');
select throws_ok($$select public.create_booking_from_quote(null, 'Cy', 'cy@example.com')$$,
  'P0002', null, 'A null token is rejected');
select throws_ok($$select public.create_booking_from_quote(rpad('q4', 40, 'x'), 'Cy', 'not-an-email')$$,
  '22023', null, 'An invalid email is rejected');
select throws_ok($$select public.create_booking_from_quote(rpad('q4', 40, 'x'), '   ', 'cy@example.com')$$,
  '22023', null, 'A blank name is rejected');
select throws_ok($$select public.create_booking_from_quote(rpad('q4', 40, 'x'), 'Cy', 'cy@example.com', 'abc')$$,
  '22023', null, 'An invalid phone is rejected');
select throws_ok($$select public.create_booking_from_quote(rpad('q10', 40, 'x'), 'Cy', 'cy@example.com')$$,
  '22023', null, 'More guests than the unit allows is rejected');
select throws_ok($$select public.create_booking_from_quote(rpad('q11', 40, 'x'), 'Cy', 'cy@example.com')$$,
  '22023', null, 'A quote in another currency than the property is rejected');
reset role;
select is((select count(*)::int from public.guests where email in ('bea@example.com', 'cy@example.com')), 0,
  'Failed attempts leave no guest behind (single transaction)');
select is((select count(*)::int from public.bookings where quote_id in (
  '90000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000003')), 0, 'Failed attempts leave no booking');

-- Adjacent stay (check-out day = next check-in) works; the guest is upserted, not overwritten.
set local role anon;
insert into res select 'b4', public.create_booking_from_quote(rpad('q4', 40, 'x'), 'Different Name', 'ana@EXAMPLE.com', null);
reset role;
select is((select count(*)::int from public.guests where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 1,
  'The same email (any case) reuses the guest');
select is((select name from public.guests where email = 'ana@example.com'), 'Ana Guest',
  'An anonymous caller cannot overwrite an existing guest name');
select is((select guest_id from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b4')),
  (select guest_id from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b1')),
  'Both bookings point to the same guest');

-- Tenant isolation: the Demo quote only ever produces Demo rows.
set local role anon;
insert into res select 'b5', public.create_booking_from_quote(rpad('q5', 40, 'x'), 'Dan Demo', 'dan@example.com');
reset role;
select is((select org_id from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b5')),
  'ff24bacc-47d2-40bc-9210-f860e98892fd'::uuid, 'The booking inherits the quote''s organization');
select is((select count(*)::int from public.guests where org_id = 'ff24bacc-47d2-40bc-9210-f860e98892fd' and email = 'dan@example.com'), 1,
  'The guest belongs to the quote''s organization');
select is((select count(*)::int from public.guests where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and email = 'dan@example.com'), 0,
  'No guest leaks into another organization');

-- ─── Expired holds free dates ───────────────────────────────────────────────
set local role anon;
insert into res select 'b6', public.create_booking_from_quote(rpad('q6', 40, 'x'), 'Eve', 'eve@example.com');
select throws_ok($$select public.create_booking_from_quote(rpad('q7', 40, 'x'), 'Fay', 'fay@example.com')$$,
  '23P01', null, 'A live hold blocks the same dates');
reset role;
update public.bookings set expires_at = now() - interval '1 minute' where id = (select (v->>'booking_id')::uuid from res where k = 'b6');
update public.calendar_blocks set expires_at = now() - interval '1 minute' where booking_id = (select (v->>'booking_id')::uuid from res where k = 'b6');
select throws_ok($$insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', '[2027-09-01,2027-09-02)', 'manual', 'x')$$,
  '23P01', null, 'Until released, an expired hold still occupies the dates (ADR 0003)');
set local role anon;
insert into res select 'b7', public.create_booking_from_quote(rpad('q7', 40, 'x'), 'Fay', 'fay@example.com');
reset role;
select is((select status::text from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b6')), 'expired',
  'The lapsed booking is marked expired');
select is((select count(*)::int from public.calendar_blocks where booking_id = (select (v->>'booking_id')::uuid from res where k = 'b6')), 0,
  'Its block was released');
select is((select status::text from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b7')), 'pending_payment',
  'A new booking takes the freed dates');

-- A voucher under review keeps the hold alive (the guest already paid).
set local role anon;
insert into res select 'b8', public.create_booking_from_quote(rpad('q8', 40, 'x'), 'Gus', 'gus@example.com');
reset role;
insert into public.payments (id, org_id, booking_id, amount_cents, currency, method)
  values ('a0000000-0000-4000-8000-000000000008', 'bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b8'), 22000, 'USD', 'yape');
update public.bookings set expires_at = now() - interval '1 minute' where id = (select (v->>'booking_id')::uuid from res where k = 'b8');
set local role anon;
select throws_ok($$select public.create_booking_from_quote(rpad('q9', 40, 'x'), 'Hal', 'hal@example.com')$$,
  '23P01', null, 'A lapsed hold with a voucher under review is not released');
reset role;
select is((select status::text from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b8')), 'pending_payment',
  'That booking stays pending_payment');

-- expire_holds: service_role only; sweeps the rest.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select throws_ok($$select public.expire_holds()$$, '42501', null, 'A member cannot run expire_holds');
reset role;
update public.bookings set expires_at = now() - interval '1 minute' where id = (select (v->>'booking_id')::uuid from res where k = 'b7');
set local role service_role;
select is(public.expire_holds(), 1, 'expire_holds expires exactly the unprotected lapsed hold');
select is(public.expire_holds(), 0, 'expire_holds is idempotent');
reset role;
select is((select status::text from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b7')), 'expired',
  'The swept booking is expired');
select is((select status::text from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b8')), 'pending_payment',
  'The booking under review survives the sweep');

-- ─── Payments: confirm / reject / cancel ────────────────────────────────────
select throws_ok($$insert into public.payments (org_id, booking_id, amount_cents, currency, method)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b1'), 100, 'PEN', 'yape')$$,
  '23503', null, 'A payment must use the booking''s currency');
insert into public.payments (id, org_id, booking_id, amount_cents, currency, method) values
  ('a0000000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b1'), 10000, 'USD', 'yape');
select throws_ok($$insert into public.payments (org_id, booking_id, amount_cents, currency, method)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b1'), 100, 'USD', 'plin')$$,
  '23505', null, 'Only one voucher can be under review per booking');

select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.confirm_payment('ff24bacc-47d2-40bc-9210-f860e98892fd', 'a0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Another org''s owner cannot confirm a payment by passing their own org');
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Another org''s owner cannot confirm a payment by passing its org');
select throws_ok($$select public.cancel_booking('ff24bacc-47d2-40bc-9210-f860e98892fd', (select (v->>'booking_id')::uuid from res where k = 'b1'))$$,
  '42501', null, 'Cross-org cancel_booking is rejected (booking not found in that org)');
select throws_ok($$select public.reject_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Cross-org reject_payment is rejected');
select is((select count(*)::int from public.bookings) + (select count(*)::int from public.guests)
  + (select count(*)::int from public.quotes) + (select count(*)::int from public.payments), 3,
  'The Demo owner sees only Demo rows (1 booking, 1 guest, 1 quote, 0 payments)');
select throws_ok($$update public.bookings set status = 'confirmed'$$, '42501', null, 'Members cannot update bookings directly');
select throws_ok($$insert into public.payments (org_id, booking_id, amount_cents, currency, method) values (gen_random_uuid(), gen_random_uuid(), 1, 'USD', 'cash')$$,
  '42501', null, 'Members cannot insert payments directly');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true); -- Saywa staff
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'A payment below the deposit cannot confirm the booking');
select lives_ok($$select public.reject_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000001', 'too little')$$,
  'Staff rejects the short payment');
select is((select v->>'replayed' from (select public.reject_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000001') v) s),
  'true', 'Rejecting twice is an idempotent replay');
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000001')$$,
  '55000', null, 'A rejected payment cannot be confirmed');
select is((select status::text from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b1')), 'pending_payment',
  'Rejecting a payment leaves the booking pending_payment');
reset role;

insert into public.payments (id, org_id, booking_id, amount_cents, currency, method) values
  ('a0000000-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b1'), 33000, 'USD', 'yape');
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$insert into res select 'c1', public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000002')$$,
  'The owner confirms a payment covering the deposit');
select is((select v->>'booking_status' from res where k = 'c1'), 'confirmed', 'The RPC reports the booking confirmed');
select results_eq($$select b.status::text, b.expires_at is null, b.confirmed_at is not null from public.bookings b where b.id = (select (v->>'booking_id')::uuid from res where k = 'b1')$$,
  $$values ('confirmed'::text, true, true)$$, 'The booking is confirmed, no longer expiring');
select results_eq($$select p.status::text, p.reviewed_by, p.reviewed_at is not null from public.payments p where p.id = 'a0000000-0000-4000-8000-000000000002'$$,
  $$values ('approved'::text, 'a3b45db1-7c15-4528-a4ba-be625665fb6d'::uuid, true)$$, 'The payment records who approved it');
select is((select expires_at from public.calendar_blocks where booking_id = (select (v->>'booking_id')::uuid from res where k = 'b1')), null,
  'The block stops expiring');
select is((select v->>'replayed' from (select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000002') v) s),
  'true', 'Confirming twice is an idempotent replay');
select throws_ok($$select public.reject_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000002')$$,
  '55000', null, 'An approved payment cannot be rejected');
select is((select count(*)::int from public.guests), 4, 'The Saywa owner sees their own 4 guests and not the Demo one (RLS)');

select lives_ok($$select public.cancel_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b1'), 'guest asked')$$,
  'A confirmed booking can be cancelled');
select results_eq($$select b.status::text, b.cancel_reason, b.cancelled_at is not null from public.bookings b where b.id = (select (v->>'booking_id')::uuid from res where k = 'b1')$$,
  $$values ('cancelled'::text, 'guest asked'::text, true)$$, 'Cancellation is recorded with its reason');
select is((select count(*)::int from public.calendar_blocks where booking_id = (select (v->>'booking_id')::uuid from res where k = 'b1')), 0,
  'Cancelling frees the dates');
select is((select v->>'replayed' from (select public.cancel_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b1')) v) s),
  'true', 'Cancelling twice is an idempotent replay');
reset role;

-- Confirming a cancelled booking is refused, even with a pending voucher.
insert into public.payments (id, org_id, booking_id, amount_cents, currency, method) values
  ('a0000000-0000-4000-8000-000000000003', 'bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b1'), 33000, 'USD', 'yape');
set local role authenticated;
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'a0000000-0000-4000-8000-000000000003')$$,
  '55000', null, 'Confirming a payment of a cancelled booking is rejected');
select throws_ok($$select public.cancel_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b7'))$$,
  '55000', null, 'An expired booking cannot be cancelled');
select throws_ok($$select public.cancel_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', gen_random_uuid())$$,
  '42501', null, 'Cancelling an unknown booking is rejected');
-- Cancelling a pending booking rejects its voucher under review and frees the dates.
select lives_ok($$select public.cancel_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'b8'))$$,
  'A pending_payment booking can be cancelled');
select is((select status::text from public.payments where id = 'a0000000-0000-4000-8000-000000000008'), 'rejected',
  'Its voucher under review is rejected with it');
reset role;
set local role anon;
select lives_ok($$select public.create_booking_from_quote(rpad('q9', 40, 'x'), 'Hal', 'hal@example.com')$$, 'The freed dates can be booked again');
reset role;

-- ─── Table-level guards (apply even to privileged writers) ──────────────────
select throws_ok($$update public.bookings set status = 'confirmed', confirmed_at = now(), expires_at = null, cancelled_at = null
  where id = (select (v->>'booking_id')::uuid from res where k = 'b1')$$, '55000', null, 'A cancelled booking cannot be reopened');
select throws_ok($$update public.bookings set status = 'pending_payment', expires_at = now() where id = (select (v->>'booking_id')::uuid from res where k = 'b7')$$,
  '55000', null, 'An expired booking cannot be reopened');
select throws_ok($$update public.bookings set total_cents = 1, deposit_cents = 1 where id = (select (v->>'booking_id')::uuid from res where k = 'b5')$$,
  '55000', null, 'Agreed amounts are immutable');
select throws_ok($$update public.bookings set unit_id = 'ee204001-0000-4000-8000-000000000001' where id = (select (v->>'booking_id')::uuid from res where k = 'b5')$$,
  '55000', null, 'The unit of a booking is immutable');
select throws_ok($$update public.payments set status = 'pending_review', reviewed_at = null where id = 'a0000000-0000-4000-8000-000000000002'$$,
  '55000', null, 'An approved payment cannot go back to review');
select throws_ok($$update public.payments set amount_cents = 1 where id = 'a0000000-0000-4000-8000-000000000003'$$,
  '55000', null, 'Payment amounts are immutable');
select throws_ok($$delete from public.units where id = 'ee204001-0000-4000-8000-000000000001'$$, '23503', null,
  'A unit with bookings cannot be deleted (no silent cascade to its blocks)');
select throws_ok($$delete from public.guests where email = 'ana@example.com'$$, '23503', null, 'A guest with bookings cannot be deleted');

-- ─── Payment accounts ───────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select lives_ok($$insert into public.property_payment_accounts (org_id, property_id, kind, holder_name, phone)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'yape', 'Saywa Lodges', '999111222')$$,
  'A member adds a Yape account');
select lives_ok($$insert into public.property_payment_accounts (org_id, property_id, kind, holder_name, bank_name, account_number, cci, currency)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'bank_account', 'Saywa Lodges', 'BCP', '1912345678901', '00219100123456789012', 'USD')$$,
  'A member adds a bank account');
select throws_ok($$insert into public.property_payment_accounts (org_id, property_id, kind, holder_name)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'plin', 'No phone')$$,
  '23514', null, 'Yape/Plin accounts require a phone');
select throws_ok($$insert into public.property_payment_accounts (org_id, property_id, kind, holder_name, bank_name, account_number)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'bank_account', 'x', 'BCP', '1912345678901'),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'bank_account', 'x', null, '1912345678901')$$,
  '23514', null, 'Bank accounts require bank name and number');
select throws_ok($$insert into public.property_payment_accounts (org_id, property_id, kind, holder_name, phone)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '57f914ac-3890-47c1-9d6d-1492782cf712', 'yape', 'Mismatch', '999111222')$$,
  '23503', null, 'The property must belong to the stated organization');
select is((select count(*)::int from public.property_payment_accounts), 2, 'The member sees both accounts');
select lives_ok($$update public.properties set booking_hold_minutes = 30 where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  'A member can configure the hold duration');
select throws_ok($$update public.properties set booking_hold_minutes = 5 where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '23514', null, 'The hold duration has sane bounds');

select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
select is((select count(*)::int from public.property_payment_accounts), 0, 'Another org''s owner sees no payment accounts');
select throws_ok($$insert into public.property_payment_accounts (org_id, property_id, kind, holder_name, phone)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'yape', 'Intruder', '999111222')$$,
  '42501', null, 'Another org''s owner cannot add accounts to this property');
reset role;

-- The configured hold length is used for the next booking.
set local role anon;
insert into res select 'b9', public.create_booking_from_quote(rpad('q12', 40, 'x'), 'Ivy', 'ivy@example.com');
reset role;
select is((select expires_at from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'b9')),
  now() + interval '30 minutes', 'The property''s hold duration drives the new booking''s expiry');

select * from finish();
rollback;
