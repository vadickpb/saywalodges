-- SD-413 (parts 2-3): guest snapshot, owner-only manual booking and manual payments.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-...; Saywa owner a3b45db1-..., Saywa staff c5d77e30-...,
-- Demo owner bd6a1c86-... (org ff24bacc-...), Demo unit ee204001-...0002.
begin;
select plan(30);

create function pg_temp.d(n integer) returns date language sql stable as $$ select (current_date + 300 + n)::date $$;

insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active) values
  ('ee413000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Manual Unit', 'room', 4, 4, true);
insert into public.unit_rates (org_id, property_id, unit_id, season_id, nightly_cents, weekend_nightly_cents, extra_guest_cents, min_nights) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee413000-0000-4000-8000-000000000001', null, 10000, null, 0, 1);
create temp table res(k text, v jsonb);
grant all on res to public;

-- ─── Catalog and grants ─────────────────────────────────────────────────────
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'public.create_manual_booking(uuid,uuid,date,date,integer,text,text,text,text)'::regprocedure,
  'public.record_manual_payment(uuid,uuid,integer,public.payment_method,text,numeric)'::regprocedure)), 'both are SECURITY DEFINER with an empty search_path');
select ok(not has_function_privilege('anon', 'public.create_manual_booking(uuid,uuid,date,date,integer,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_manual_payment(uuid,uuid,integer,public.payment_method,text,numeric)', 'EXECUTE'),
  'anon cannot execute either');
select is((select array_agg(a order by a) from unnest(proargnames) a where a like '%cents%' or a like '%total%' or a like '%price%')
  , array['p_amount_cents'], 'create_manual_booking takes no price; record_manual_payment takes only the amount received')
  from pg_proc where oid = 'public.record_manual_payment(uuid,uuid,integer,public.payment_method,text,numeric)'::regprocedure;

-- ─── Staff and other organizations are refused ──────────────────────────────
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select throws_ok($$select public.create_manual_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee413000-0000-4000-8000-000000000001', pg_temp.d(0), pg_temp.d(3), 2, 'Ana', 'ana@example.com')$$,
  '42501', 'not allowed', 'staff cannot create a manual booking');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.create_manual_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee413000-0000-4000-8000-000000000001', pg_temp.d(0), pg_temp.d(3), 2, 'Ana', 'ana@example.com')$$,
  '42501', 'not allowed', 'the owner of another organization cannot book into this one');
select throws_ok($$select public.create_manual_booking('ff24bacc-47d2-40bc-9210-f860e98892fd', 'ee413000-0000-4000-8000-000000000001', pg_temp.d(0), pg_temp.d(3), 2, 'Ana', 'ana@example.com')$$,
  '42501', 'not allowed', 'nor can they use this unit with their own organization id');
reset role;

-- ─── The owner ──────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$insert into res select 'm1', public.create_manual_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee413000-0000-4000-8000-000000000001', pg_temp.d(0), pg_temp.d(3), 2, 'Ana Cash', 'ana@example.com', '+51 999 111 222', 'es')$$,
  'the owner creates a manual booking');
select is((select v->>'total_cents' from res where k = 'm1'), '30000', 'priced by the database: 3 nights x 100.00');
select is((select status::text from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'm1')), 'pending_payment', 'it starts pending_payment with a hold');
select is((select count(*)::int from public.calendar_blocks where booking_id = (select (v->>'booking_id')::uuid from res where k = 'm1')), 1, 'and blocks the calendar');
select is((select guest_name || '|' || guest_phone from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'm1')), 'Ana Cash|+51 999 111 222', 'the booking keeps the typed guest data (snapshot)');
select throws_ok($$select public.create_manual_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee413000-0000-4000-8000-000000000001', pg_temp.d(1), pg_temp.d(2), 2, 'Beto', 'beto@example.com')$$,
  '23P01', null, 'occupied dates are refused by the exclusion constraint');
select throws_ok($$select public.create_manual_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee413000-0000-4000-8000-000000000001', current_date - 10, current_date - 8, 2, 'Beto', 'beto@example.com')$$,
  '22023', null, 'past dates are refused');
select throws_ok($$select public.create_manual_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee413000-0000-4000-8000-000000000001', pg_temp.d(10), pg_temp.d(12), 2, 'Beto', 'not-an-email')$$,
  '22023', null, 'an invalid e-mail is refused');
select is((select public.create_manual_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee413000-0000-4000-8000-000000000001', pg_temp.d(10), pg_temp.d(12), 9, 'Beto', 'beto@example.com')->>'error'),
  'CAPACITY_EXCEEDED', 'pricing errors come back as data, like the public quote');

-- ─── Payments: deposit, balance, limits ─────────────────────────────────────
select throws_ok($$select public.record_manual_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'm1'), 100, 'cash', null, 3.75)$$,
  '22023', 'payment is below the required deposit', 'a deposit below the required one does not confirm');
select throws_ok($$select public.record_manual_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'm1'), 30001, 'cash', null, 3.75)$$,
  '22023', 'payment exceeds the total', 'nor can it exceed the total');
select throws_ok($$select public.record_manual_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'm1'), 15000, 'mercado_pago', null, 3.75)$$,
  '22023', null, 'Mercado Pago is not a manual method');
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select throws_ok($$select public.record_manual_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'm1'), 15000, 'cash', null, 3.75)$$,
  '42501', 'not allowed', 'staff cannot register a payment');
reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$select public.record_manual_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'm1'), 15000, 'cash', 'recibo 1', 3.75)$$,
  'the owner registers the deposit');
select is((select status::text from public.bookings where id = (select (v->>'booking_id')::uuid from res where k = 'm1')), 'confirmed', 'the deposit confirms the booking');
select lives_ok($$select public.record_manual_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'm1'), 15000, 'yape', null, 3.75)$$,
  'and then the balance');
select throws_ok($$select public.record_manual_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', (select (v->>'booking_id')::uuid from res where k = 'm1'), 1, 'cash', null, 3.75)$$,
  '22023', 'payment exceeds the total', 'a fully paid booking takes nothing more');
reset role;
select is((select sum(amount_cents)::int from public.payments where booking_id = (select (v->>'booking_id')::uuid from res where k = 'm1') and status = 'approved'), 30000, 'two approved payments add up to the total');
select is((select count(*)::int from public.finance_entries where source = 'booking' and external_ref in (
  select id::text from public.payments where booking_id = (select (v->>'booking_id')::uuid from res where k = 'm1'))), 2, 'each one wrote its ledger income');

-- ─── Checkout snapshot: existing guest data is not rewritten by an anonymous caller ─────────────
insert into public.guests (org_id, name, email, phone) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'Carla Original', 'carla@example.com', '+51 900 000 000');
set local role anon;
create temp table qt(token text);
grant all on qt to public;
insert into qt select public.create_public_quote('saywa-lodges', 'ee413000-0000-4000-8000-000000000001', pg_temp.d(20), pg_temp.d(22), 2)->>'token';
select lives_ok($$select public.create_localized_booking_from_quote((select token from qt), 'Carla Typed', 'carla@example.com', '+51 911 222 333', 'es')$$, 'a guest books from a public quote');
reset role;
select is((select phone from public.guests where email = 'carla@example.com'), '+51 900 000 000', 'the existing guest keeps her own phone');
select is((select b.guest_name || '|' || b.guest_phone from public.bookings b join public.guests g on g.id = b.guest_id where g.email = 'carla@example.com'), 'Carla Typed|+51 911 222 333', 'the booking keeps what was typed at checkout');
select is((select name from public.guests where email = 'carla@example.com'), 'Carla Original', 'and the guest record keeps her name');

select * from finish();
rollback;
