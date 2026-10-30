-- SD-807: income from direct bookings (confirm_payment) and from imported iCal stays.
-- Ids from supabase/seed.sql:
--   orgs  Saywa bf88f504-..., Demo ff24bacc-...
--   users Saywa owner a3b45db1-..., Saywa staff c5d77e30-..., Demo owner bd6a1c86-...
--   units Saywa ee204001-...0001 (property 131583b5-..., USD), Demo ee204001-...0002 (property 57f914ac-..., PEN)
-- Two real concurrent sessions are not available in pgTAP: exactly-once is proven by replays, by a
-- pre-existing key (the ON CONFLICT path a lost race takes) and by the unique index itself.
begin;
select plan(89);

-- ─── Catalog ────────────────────────────────────────────────────────────────
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'public.confirm_payment(uuid,uuid,numeric)'::regprocedure,
  'public.complete_ical_rental(uuid,uuid,integer,public.currency_code,date,numeric,integer,integer)'::regprocedure)),
  'confirm_payment and complete_ical_rental are SECURITY DEFINER with an empty search_path');
select ok(not (select prosecdef from pg_proc where oid = 'public.list_ical_rentals_to_complete(uuid)'::regprocedure),
  'The listing runs with the caller''s rights (RLS applies)');
select ok(not has_function_privilege('anon', 'public.confirm_payment(uuid,uuid,numeric)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_ical_rentals_to_complete(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.complete_ical_rental(uuid,uuid,integer,public.currency_code,date,numeric,integer,integer)', 'EXECUTE'),
  'anon cannot execute any of the SD-807 functions');
select ok(has_function_privilege('authenticated', 'public.list_ical_rentals_to_complete(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.complete_ical_rental(uuid,uuid,integer,public.currency_code,date,numeric,integer,integer)', 'EXECUTE'),
  'authenticated can execute the iCal functions (the owner check is inside)');
select ok(not ('external_uid' = any (select unnest(proargnames) from pg_proc where oid = 'public.list_ical_rentals_to_complete(uuid)'::regprocedure)),
  'The listing has no uid column: the private event id never leaves the database');

-- ─── Fixtures: direct bookings (table owner) ────────────────────────────────
insert into public.guests (id, org_id, name, email) values
  ('b0000000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'Ana Guest', 'ana807@example.com'),
  ('b0000000-0000-4000-8000-000000000002', 'ff24bacc-47d2-40bc-9210-f860e98892fd', 'Demo Guest', 'demo807@example.com');
insert into public.quotes (id, org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
  total_cents, deposit_cents, expires_at, created_at)
select ('b1000000-0000-4000-8000-00000000000' || n)::uuid,
       case when n = 8 then 'ff24bacc-47d2-40bc-9210-f860e98892fd'::uuid else 'bf88f504-051f-4fdc-ab73-4fa12d715817'::uuid end,
       case when n = 8 then '57f914ac-3890-47c1-9d6d-1492782cf712'::uuid else '131583b5-785e-4127-81f0-e097163c5654'::uuid end,
       case when n = 8 then 'ee204001-0000-4000-8000-000000000002'::uuid else 'ee204001-0000-4000-8000-000000000001'::uuid end,
       rpad('q807-' || n, 40, 'x'), '2027-11-10', '2027-11-13', 4,
       case when n = 8 then 'PEN'::public.currency_code else 'USD'::public.currency_code end,
       case when n = 8 then 30000 when n = 4 then 44000 else 66000 end,
       case when n = 8 then 15000 when n in (3, 4, 5, 6, 7) then 22000 else 33000 end,
       now() + interval '1 day', now()
from generate_series(1, 8) n;
insert into public.bookings (id, org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out, guests, currency,
  total_cents, deposit_cents, status, expires_at)
select ('b2000000-0000-4000-8000-00000000000' || n)::uuid, q.org_id, q.property_id, q.unit_id,
       case when n = 8 then 'b0000000-0000-4000-8000-000000000002'::uuid else 'b0000000-0000-4000-8000-000000000001'::uuid end,
       q.id,
       case n when 1 then '2027-11-10' when 2 then '2027-12-10' when 3 then '2028-01-10' when 4 then '2028-02-10'
              when 5 then '2028-03-10' when 6 then '2028-04-10' when 7 then '2028-05-10' else '2027-11-10' end::date,
       case n when 1 then '2027-11-13' when 2 then '2027-12-12' when 3 then '2028-01-12' when 4 then '2028-02-12'
              when 5 then '2028-03-12' when 6 then '2028-04-12' when 7 then '2028-05-12' else '2027-11-13' end::date,
       case when n = 1 then 4 else 2 end, q.currency, q.total_cents, q.deposit_cents, 'pending_payment', now() + interval '1 day'
from public.quotes q, generate_series(1, 8) n
where q.id = ('b1000000-0000-4000-8000-00000000000' || n)::uuid;
-- P1 was registered at 03:00 UTC = 22:00 of the previous day in Lima.
insert into public.payments (id, org_id, booking_id, amount_cents, currency, method, created_at) values
  ('b3000000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000001', 33000, 'USD', 'yape', '2027-11-06 03:00:00+00'),
  ('b3000000-0000-4000-8000-000000000002', 'ff24bacc-47d2-40bc-9210-f860e98892fd', 'b2000000-0000-4000-8000-000000000008', 15000, 'PEN', 'cash', now()),
  ('b3000000-0000-4000-8000-000000000003', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000002', 33000, 'USD', 'bank_transfer', now()),
  ('b3000000-0000-4000-8000-000000000004', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000003', 22000, 'USD', 'mercado_pago', now()),
  ('b3000000-0000-4000-8000-000000000005', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000004', 10000, 'USD', 'yape', now()),
  ('b3000000-0000-4000-8000-000000000006', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000005', 22000, 'USD', 'yape', now()),
  ('b3000000-0000-4000-8000-000000000007', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000006', 22000, 'USD', 'yape', now()),
  ('b3000000-0000-4000-8000-000000000008', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000007', 22000, 'USD', 'yape', now());
-- A key that already exists for P8 (what a concurrent confirmation would have left behind).
-- In soles on purpose: no foreign-currency rate may exist yet for the "rate required" test below.
insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, source, external_ref)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', c.id, '2028-05-01', 1000, 'PEN', 'booking', 'b3000000-0000-4000-8000-000000000008'
from public.finance_categories c where c.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and c.system_key = 'rental';

select is((select count(*)::int from public.finance_entries where source = 'booking'), 1,
  'Before any confirmation the only booking income is the pre-seeded key');

-- ─── Foreign currency without a rate is refused before anything changes ─────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000003')$$,
  '22023', 'exchange rate required', 'A USD payment with no rate and no earlier rate cannot be confirmed');
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000003', 150)$$,
  '22023', 'exchange rate required', 'An out-of-range rate is refused');
reset role;
select results_eq($$select p.status::text, b.status::text from public.payments p join public.bookings b on b.id = p.booking_id
  where p.id = 'b3000000-0000-4000-8000-000000000003'$$,
  $$values ('pending_review'::text, 'pending_payment'::text)$$, 'The refused confirmation changed neither the payment nor the booking');
select is((select count(*)::int from public.finance_entries where external_ref = 'b3000000-0000-4000-8000-000000000003'), 0,
  'And wrote no income');

-- ─── Below the deposit ──────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true); -- Saywa staff
set local role authenticated;
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000005', 3.75)$$,
  '22023', 'payment is below the required deposit', 'A payment below the deposit is refused');
reset role;
select is((select count(*)::int from public.finance_entries where external_ref = 'b3000000-0000-4000-8000-000000000005'), 0, 'It wrote no income');

-- ─── Approval writes the income, once ───────────────────────────────────────
set local role authenticated; -- still Saywa staff
select lives_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000001', 3.75)$$,
  'Staff confirms the payment with an explicit rate');
select is((select count(*)::int from public.finance_entries), 0, 'Staff did not gain access to the ledger row (created_by is null)');
reset role;
select results_eq($$select e.kind::text, e.amount_cents, e.currency::text, e.fx_rate_pen::text, e.amount_pen_cents::int,
    e.occurred_on::text, e.stay_start::text, e.stay_end::text, e.channel::text, e.guests,
    e.payment_method::text, e.counterparty, e.source::text
  from public.finance_entries e where e.external_ref = 'b3000000-0000-4000-8000-000000000001'$$,
  $$values ('income'::text, 33000, 'USD'::text, '3.750000'::text, 123750, '2027-11-05'::text, '2027-11-10'::text, '2027-11-13'::text,
            'direct'::text, 4, 'yape_plin'::text, 'Ana Guest'::text, 'booking'::text)$$,
  'The income is the approved payment: amount, currency, rate, Lima cash date, stay, channel, guests, method, guest');
select results_eq($$select c.system_key, e.unit_id, e.created_by is null from public.finance_entries e
    join public.finance_categories c on c.id = e.category_id where e.external_ref = 'b3000000-0000-4000-8000-000000000001'$$,
  $$values ('rental'::text, 'ee204001-0000-4000-8000-000000000001'::uuid, true)$$, 'It uses the built-in rental category and the booking''s unit');
select is((select count(*)::int from public.bookings where id = 'b2000000-0000-4000-8000-000000000001' and status = 'confirmed'), 1,
  'The booking is confirmed in the same transaction');

-- Replays: the income is not duplicated, whoever repeats it and whatever rate they pass.
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select is((select v->>'replayed' from (select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000001', 4.2) v) s),
  'true', 'Confirming again is a replay');
select is((select v->>'replayed' from (select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000001') v) s),
  'true', 'Confirming a third time is a replay too');
select is((select count(*)::int from public.finance_entries where external_ref = 'b3000000-0000-4000-8000-000000000001'), 1,
  'The owner sees exactly one income for the payment after the replays');
select is((select fx_rate_pen::text from public.finance_entries where external_ref = 'b3000000-0000-4000-8000-000000000001'), '3.750000',
  'A replay with another rate does not touch the recorded income');

-- The most recent rate of the org is reused when none is passed.
select lives_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000004')$$,
  'Without an explicit rate the last rate in the ledger is used');
select results_eq($$select e.fx_rate_pen::text, e.amount_pen_cents::int, e.payment_method::text from public.finance_entries e
  where e.external_ref = 'b3000000-0000-4000-8000-000000000004'$$,
  $$values ('3.750000'::text, 82500, 'other'::text)$$, 'It carries the reused rate and Mercado Pago maps to "other"');

-- Another confirmation with the key already present neither fails nor duplicates (the lost-race path).
select lives_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000008', 3.75)$$,
  'Confirming a payment whose income key already exists succeeds');
select results_eq($$select count(*)::int, min(amount_cents) from public.finance_entries where external_ref = 'b3000000-0000-4000-8000-000000000008'$$,
  $$values (1, 1000)$$, 'And keeps the single existing income untouched');
reset role;
select throws_ok($$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, source, external_ref)
  select org_id, kind, category_id, occurred_on, 5, 'PEN', 'booking', 'b3000000-0000-4000-8000-000000000001'
  from public.finance_entries where external_ref = 'b3000000-0000-4000-8000-000000000001' and currency = 'USD'$$,
  '23505', null, 'The unique index rejects a second income for the same payment');
select throws_ok($$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, source, external_ref)
  select org_id, kind, category_id, occurred_on, 5, 'USD', 3.7, 'booking', 'b3000000-0000-4000-8000-000000000001'
  from public.finance_entries where external_ref = 'b3000000-0000-4000-8000-000000000001'$$,
  '23505', null, 'Even with other amounts and rates');

-- ─── Reject / cancel / currency ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$select public.reject_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000006', 'blurry')$$,
  'A payment is rejected');
select lives_ok($$select public.cancel_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000006', 'changed plans')$$,
  'A booking with a voucher under review is cancelled');
select is((select count(*)::int from public.finance_entries where external_ref in
  ('b3000000-0000-4000-8000-000000000006', 'b3000000-0000-4000-8000-000000000007')), 0,
  'Rejected and cancelled-before-approval payments produce no income');
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000006', 3.75)$$,
  '55000', null, 'A rejected payment cannot be confirmed afterwards');
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000007', 3.75)$$,
  '55000', null, 'Nor can the payment of a cancelled booking');
select lives_ok($$select public.cancel_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000001', 'guest asked')$$,
  'A confirmed booking is cancelled');
select is((select count(*)::int from public.finance_entries where external_ref = 'b3000000-0000-4000-8000-000000000001'), 1,
  'Cancelling keeps the income already received (refunds are not modelled) and never duplicates it');
select is((select v->>'replayed' from (select public.cancel_booking('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2000000-0000-4000-8000-000000000001') v) s),
  'true', 'Cancelling twice is a replay');
select is((select count(*)::int from public.finance_entries where source = 'booking'), 3,
  'In total: payments 1, 4 and the pre-existing 8 have income, nothing else');

-- ─── Cross-org and isolation ────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true); -- Demo owner
set local role authenticated;
select throws_ok($$select public.confirm_payment('ff24bacc-47d2-40bc-9210-f860e98892fd', 'b3000000-0000-4000-8000-000000000003', 3.75)$$,
  '42501', null, 'The Demo owner cannot confirm a Saywa payment passing their own org');
select throws_ok($$select public.confirm_payment('bf88f504-051f-4fdc-ab73-4fa12d715817', 'b3000000-0000-4000-8000-000000000003', 3.75)$$,
  '42501', null, 'Nor by passing the Saywa org');
select lives_ok($$select public.confirm_payment('ff24bacc-47d2-40bc-9210-f860e98892fd', 'b3000000-0000-4000-8000-000000000002', 4.0)$$,
  'The Demo owner confirms their own PEN payment (a rate passed for soles is ignored)');
select results_eq($$select e.amount_cents, e.fx_rate_pen is null, e.amount_pen_cents::int, e.payment_method::text, e.channel::text
  from public.finance_entries e where e.source = 'booking'$$,
  $$values (15000, true, 15000, 'cash'::text, 'direct'::text)$$,
  'The Demo owner sees only their own booking income, in soles without a rate');
reset role;
select is((select count(*)::int from public.finance_entries where external_ref = 'b3000000-0000-4000-8000-000000000003'), 0,
  'The cross-org attempts wrote nothing');
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select is((select count(*)::int from public.finance_entries where org_id = 'ff24bacc-47d2-40bc-9210-f860e98892fd'), 0,
  'The Saywa owner does not see the Demo income');
reset role;

-- ─── iCal fixtures (table owner) ────────────────────────────────────────────
insert into public.ical_feeds (id, org_id, unit_id, channel, import_url) values
  ('f8070000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'airbnb', 'https://www.airbnb.com/807'),
  ('f8070000-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'booking', 'https://ical.booking.com/807'),
  ('f8070000-0000-4000-8000-000000000003', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'vrbo', 'https://vrbo.com/807'),
  ('f8070000-0000-4000-8000-000000000004', 'ff24bacc-47d2-40bc-9210-f860e98892fd', 'ee204001-0000-4000-8000-000000000002', 'airbnb', 'https://www.airbnb.com/807d');
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, feed_id, external_uid) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', '[2026-03-01,2026-03-04)', 'ical', 'f8070000-0000-4000-8000-000000000001', repeat('a', 64)),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', '[2026-03-10,2026-03-13)', 'ical', 'f8070000-0000-4000-8000-000000000001', repeat('b', 64)),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', '[2026-04-01,2026-04-03)', 'ical', 'f8070000-0000-4000-8000-000000000002', repeat('c', 64)),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', '[2026-05-01,2026-05-03)', 'ical', 'f8070000-0000-4000-8000-000000000003', repeat('d', 64)),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', '[2099-01-01,2099-01-03)', 'ical', 'f8070000-0000-4000-8000-000000000001', repeat('e', 64)),
  ('ff24bacc-47d2-40bc-9210-f860e98892fd', '57f914ac-3890-47c1-9d6d-1492782cf712', 'ee204001-0000-4000-8000-000000000002', '[2026-03-01,2026-03-03)', 'ical', 'f8070000-0000-4000-8000-000000000004', repeat('f', 64));
insert into public.calendar_blocks (org_id, property_id, unit_id, period, source) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001', '[2026-06-01,2026-06-05)', 'manual');
insert into public.finance_unit_settings (unit_id, org_id, cleaning_cost_cents)
values ('ee204001-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 8000);
create temp table blk as select external_uid as uid, id from public.calendar_blocks where external_uid is not null;
grant select on blk to authenticated;
create temp table done (k text primary key, v jsonb);
grant all on done to authenticated;
create function pg_temp.sync_snapshot(feed uuid, events jsonb) returns boolean language plpgsql as $$
declare lease jsonb;
begin
  lease := public.begin_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817', feed);
  return public.finish_ical_sync('bf88f504-051f-4fdc-ab73-4fa12d715817', feed, (lease->>'token')::uuid, events);
end; $$;

-- ─── Listing: only started Airbnb/Booking stays without income ───────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select is((select count(*)::int from public.list_ical_rentals_to_complete('bf88f504-051f-4fdc-ab73-4fa12d715817')), 3,
  'Three stays: Airbnb x2 and Booking x1; not Vrbo, manual blocks, future stays or other orgs');
select results_eq($$select channel, stay_start::text, stay_end::text, suggested_cleaning_cents, currency::text
    from public.list_ical_rentals_to_complete('bf88f504-051f-4fdc-ab73-4fa12d715817') order by stay_start desc$$,
  $$values ('booking'::text, '2026-04-01'::text, '2026-04-03'::text, 8000, 'USD'::text),
           ('airbnb'::text, '2026-03-10'::text, '2026-03-13'::text, 8000, 'USD'::text),
           ('airbnb'::text, '2026-03-01'::text, '2026-03-04'::text, 8000, 'USD'::text)$$,
  'Each carries the channel, dates and the suggested cleaning of its house');
select is((select count(*)::int from public.finance_entries where source = 'ical'), 0,
  'Listing writes nothing and infers no amount: there is no iCal income yet');

-- ─── Completing a stay ──────────────────────────────────────────────────────
select lives_ok($$insert into done select 'a1', public.complete_ical_rental(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_block_id => (select id from blk where uid = repeat('a', 64)),
    p_amount_cents => 15000, p_currency => 'USD', p_occurred_on => '2026-03-02', p_fx_rate_pen => 3.75,
    p_guests => 2, p_cleaning_cents => 8000)$$, 'The owner completes an Airbnb stay with the amount they type');
select is((select v->>'replayed' from done where k = 'a1'), 'false', 'First call is not a replay');
select results_eq($$select e.kind::text, e.amount_cents, e.currency::text, e.amount_pen_cents::int, e.occurred_on::text,
    e.stay_start::text, e.stay_end::text, e.channel::text, e.guests, e.source::text, e.payment_method::text
  from public.finance_entries e where e.id = (select (v->>'rental_id')::uuid from done where k = 'a1')$$,
  $$values ('income'::text, 15000, 'USD'::text, 56250, '2026-03-02'::text, '2026-03-01'::text, '2026-03-04'::text,
            'airbnb'::text, 2, 'ical'::text, 'platform'::text)$$,
  'The income carries the owner''s amount, the stay of the feed and its channel');
select results_eq($$select e.kind::text, e.amount_cents, e.occurred_on::text,
    e.related_entry_id = (select (v->>'rental_id')::uuid from done where k = 'a1'), e.source::text
  from public.finance_entries e where e.external_ref like 'ical:%:cleaning'$$,
  $$values ('expense'::text, 8000, '2026-03-04'::text, true, 'ical'::text)$$,
  'The cleaning is an expense linked to the rental on check-out day');
select ok((select e.external_ref ~ '^ical:[a-f0-9]{64}$' and position(repeat('a', 64) in e.external_ref) = 0
    from public.finance_entries e where e.id = (select (v->>'rental_id')::uuid from done where k = 'a1')),
  'The stored key is an opaque hash, not the event uid');
select is((select count(*)::int from public.list_ical_rentals_to_complete('bf88f504-051f-4fdc-ab73-4fa12d715817')), 2,
  'The completed stay leaves the list');

-- Replays and re-sync.
select is((select v->>'replayed' from (select public.complete_ical_rental(
    'bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from blk where uid = repeat('a', 64)), 99999, 'USD', '2026-03-09', 3.9, 9, 5000) v) s),
  'true', 'Completing the same stay again is a replay');
select is((select count(*)::int from public.finance_entries where source = 'ical'), 2,
  'The replay added neither income nor cleaning (the owner''s first figures stand)');
select ok(pg_temp.sync_snapshot('f8070000-0000-4000-8000-000000000001', jsonb_build_array(
    jsonb_build_object('uid', repeat('a', 64), 'start', '2026-03-02', 'end', '2026-03-05'),
    jsonb_build_object('uid', repeat('b', 64), 'start', '2026-03-10', 'end', '2026-03-13'))),
  'The feed is re-synced with the first stay moved by a day');
select is((select count(*)::int from public.list_ical_rentals_to_complete('bf88f504-051f-4fdc-ab73-4fa12d715817')), 2,
  'The moved event is still done (same private uid), the other two are still listed; the future event is gone');
select is((select count(*)::int from public.finance_entries where source = 'ical'), 2,
  'Re-syncing created no movements');
select is((select v->>'replayed' from (select public.complete_ical_rental(
    'bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from public.calendar_blocks where external_uid = repeat('a', 64)), 1000, 'PEN', '2026-03-09') v) s),
  'true', 'Completing the re-created block is also a replay');

-- A stay already typed by hand is not offered again and is not duplicated.
select lives_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2026-04-01', p_stay_end => '2026-04-03', p_channel => 'booking', p_occurred_on => '2026-04-03',
    p_amount_cents => 20000, p_currency => 'PEN')$$, 'The owner registers the Booking stay by hand');
select is((select count(*)::int from public.list_ical_rentals_to_complete('bf88f504-051f-4fdc-ab73-4fa12d715817')), 1,
  'A hand-registered stay with the same dates leaves the list');
select is((select v->>'replayed' from (select public.complete_ical_rental(
    'bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from public.calendar_blocks where external_uid = repeat('c', 64)), 20000, 'PEN', '2026-04-03') v) s),
  'true', 'Completing it anyway returns the manual rental');
select is((select count(*)::int from public.finance_entries where source = 'ical'), 2, 'No iCal income was added for it');

-- Invalid input changes nothing.
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where external_uid = repeat('b', 64)), 0, 'PEN', '2026-03-13')$$,
  '22023', 'invalid input', 'A zero amount is refused');
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where external_uid = repeat('b', 64)), 100, 'USD', '2026-03-13')$$,
  '22023', 'invalid input', 'USD without a rate is refused');
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where external_uid = repeat('b', 64)), 100, 'PEN', '2026-03-13', 3.7)$$,
  '22023', 'invalid input', 'PEN with a rate is refused');
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where external_uid = repeat('b', 64)), 100, 'PEN', '2026-03-13', null, 0)$$,
  '22023', 'invalid input', 'Zero guests is refused');
select is((select count(*)::int from public.finance_entries where source = 'ical'), 2, 'Nothing was written by the refused calls');

-- Not completable: manual block, other channel, another org's block, nonexistent.
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where source = 'manual'), 100, 'PEN', '2026-06-05')$$,
  '42501', 'stay not found', 'A manual owner block is not a rental and cannot be completed');
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where external_uid = repeat('d', 64)), 100, 'PEN', '2026-05-03')$$,
  '42501', 'stay not found', 'A Vrbo stay is outside this ticket');
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where external_uid = repeat('f', 64)), 100, 'PEN', '2026-03-03')$$,
  '42501', 'stay not found', 'The owner of one org cannot complete a stay of another');
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817', gen_random_uuid(), 100, 'PEN', '2026-03-03')$$,
  '42501', 'stay not found', 'An unknown block is refused');
select is((select count(*)::int from public.calendar_blocks where source = 'manual'), 1, 'Manual blocks are untouched');

-- Second stay without cleaning.
select lives_ok($$insert into done select 'b', public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where external_uid = repeat('b', 64)), 30000, 'PEN', '2026-03-13')$$,
  'The second stay is completed in soles without cleaning');
select is((select count(*)::int from public.finance_entries where related_entry_id = (select (v->>'rental_id')::uuid from done where k = 'b')), 0,
  'No cleaning is invented when the owner does not ask for it');
select is((select count(*)::int from public.list_ical_rentals_to_complete('bf88f504-051f-4fdc-ab73-4fa12d715817')), 0, 'The list is empty');

-- ─── Roles ──────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true); -- Saywa staff
set local role authenticated;
select throws_ok($$select * from public.list_ical_rentals_to_complete('bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '42501', 'not allowed', 'Staff cannot list the stays to complete');
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where external_uid = repeat('b', 64)), 100, 'PEN', '2026-03-13')$$,
  '42501', 'not allowed', 'Staff cannot complete a stay');
select is((select count(*)::int from public.finance_entries), 0, 'Staff see no automatic income');
reset role;

select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true); -- Demo owner
set local role authenticated;
select throws_ok($$select * from public.list_ical_rentals_to_complete('bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '42501', 'not allowed', 'The Demo owner cannot list Saywa''s stays');
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817',
  (select id from public.calendar_blocks where external_uid = repeat('f', 64)), 100, 'PEN', '2026-03-03')$$,
  '42501', 'not allowed', 'Nor complete a stay passing the Saywa org');
select throws_ok($$select public.complete_ical_rental('ff24bacc-47d2-40bc-9210-f860e98892fd',
  (select id from blk where uid = repeat('b', 64)), 100, 'PEN', '2026-03-03')$$,
  '42501', 'stay not found', 'Nor a Saywa block passing their own org');
select is((select count(*)::int from public.list_ical_rentals_to_complete('ff24bacc-47d2-40bc-9210-f860e98892fd')), 1,
  'They see their own Demo stay only');
select lives_ok($$select public.complete_ical_rental('ff24bacc-47d2-40bc-9210-f860e98892fd',
  (select id from public.calendar_blocks where external_uid = repeat('f', 64)), 10000, 'PEN', '2026-03-03')$$,
  'And complete it');
select is((select count(*)::int from public.finance_entries where source = 'ical'), 1, 'They see only their own iCal income');
reset role;

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select is((select count(*)::int from public.finance_entries where unit_id = 'ee204001-0000-4000-8000-000000000002'), 0,
  'The Saywa owner does not see the Demo iCal income');
select is((select count(*)::int from public.finance_entries where source = 'ical' and org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 3,
  'Saywa has its own three iCal movements: two incomes and one cleaning');
reset role;

set local role anon;
select throws_ok($$select * from public.list_ical_rentals_to_complete('bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '42501', null, 'anon cannot list');
select throws_ok($$select public.complete_ical_rental('bf88f504-051f-4fdc-ab73-4fa12d715817', gen_random_uuid(), 100, 'PEN', '2026-03-13')$$,
  '42501', null, 'anon cannot complete');
reset role;

-- ─── Ledger reads stay consistent ───────────────────────────────────────────
select is((select count(distinct external_ref)::int = count(*)::int from public.finance_entries where external_ref is not null),
  true, 'Every automatic movement of the ledger has a distinct key');
select is((select count(*)::int from public.finance_entries where source = 'ical' and kind = 'income' and amount_pen_cents is null), 0,
  'Automatic income always has a PEN amount for the reports');

select * from finish();
rollback;
