-- SD-803: public.create_rental_entries. Ids from supabase/seed.sql:
--   orgs  Saywa bf88f504-..., Demo ff24bacc-...
--   users Saywa owner a3b45db1-..., Saywa staff c5d77e30-..., Demo owner bd6a1c86-...
--   units Saywa ee204001-...0001, Demo ee204001-...0002
begin;
select plan(26);

-- ─── Saywa owner: rental + commission + cleaning in one call ────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

create temp table result (rental_id uuid);
grant all on result to authenticated;
insert into result
select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-05-01',
    p_stay_end => '2027-05-04',
    p_channel => 'airbnb',
    p_guests => 4,
    p_guest_name => 'Guest One',
    p_occurred_on => '2027-05-04',
    p_amount_cents => 100000,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => 'platform',
    p_receipt_path => null,
    p_note => 'first stay',
    p_commission_cents => 15000,
    p_cleaning_cents => 8000
  );

select is((select count(*)::int from public.finance_entries where counterparty = 'Guest One' or related_entry_id = (select rental_id from result)), 3,
  'One call writes the rental, the commission and the cleaning');
select results_eq(
  $$select kind::text, amount_cents, stay_start::text, stay_end::text, channel::text, guests
      from public.finance_entries where id = (select rental_id from result)$$,
  $$values ('income'::text, 100000, '2027-05-01'::text, '2027-05-04'::text, 'airbnb'::text, 4)$$,
  'The rental carries the stay, channel and guests');
select results_eq(
  $$select c.system_key, e.amount_cents, e.occurred_on::text, e.payment_method::text
      from public.finance_entries e join public.finance_categories c on c.id = e.category_id
     where e.related_entry_id = (select rental_id from result) order by c.system_key$$,
  $$values ('cleaning'::text, 8000, '2027-05-04'::text, null::text),
           ('platform_commission'::text, 15000, '2027-05-04'::text, 'platform'::text)$$,
  'Commission and cleaning are linked to the rental, by built-in category');
select is((select count(distinct unit_id)::int from public.finance_entries where related_entry_id = (select rental_id from result)
            or id = (select rental_id from result)), 1, 'All three entries belong to the same unit');
select is((select created_by from public.finance_entries where id = (select rental_id from result)),
  'a3b45db1-7c15-4528-a4ba-be625665fb6d'::uuid, 'created_by is the session user');

-- USD: the rental and its commission share one exchange rate.
create temp table usd_result (rental_id uuid);
grant all on usd_result to authenticated;
insert into usd_result
select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-06-01',
    p_stay_end => '2027-06-02',
    p_channel => 'direct',
    p_guests => 2,
    p_guest_name => 'Guest USD',
    p_occurred_on => '2027-06-01',
    p_amount_cents => 10000,
    p_currency => 'USD',
    p_fx_rate_pen => 3.75,
    p_payment_method => 'bank_transfer',
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => 1000,
    p_cleaning_cents => null
  );
select results_eq(
  $$select e.amount_pen_cents::int, e.fx_rate_pen::text from public.finance_entries e
     where e.id = (select rental_id from usd_result) or e.related_entry_id = (select rental_id from usd_result)
     order by e.amount_cents desc$$,
  $$values (37500, '3.750000'::text), (3750, '3.750000'::text)$$,
  'USD rental and commission convert with the same rate');

-- Optional costs: absent or zero create nothing.
select lives_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-07-01',
    p_stay_end => '2027-07-02',
    p_channel => 'direct',
    p_guests => 1,
    p_guest_name => 'No costs',
    p_occurred_on => '2027-07-01',
    p_amount_cents => 5000,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => null,
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => 0,
    p_cleaning_cents => null
  )$$,
  'A rental with a zero commission and no cleaning is accepted');
select is((select count(*)::int from public.finance_entries where related_entry_id = (select id from public.finance_entries where counterparty = 'No costs')), 0,
  'A zero commission and a missing cleaning create no cost entries');

-- Validation comes from the table constraints, and nothing is left behind.
select throws_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-08-01',
    p_stay_end => '2027-08-02',
    p_channel => 'direct',
    p_guests => 1,
    p_guest_name => 'Bad USD',
    p_occurred_on => '2027-08-01',
    p_amount_cents => 5000,
    p_currency => 'USD',
    p_fx_rate_pen => null,
    p_payment_method => null,
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => null,
    p_cleaning_cents => null
  )$$,
  '23514', null, 'USD without an exchange rate is rejected');
select throws_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-08-05',
    p_stay_end => '2027-08-05',
    p_channel => 'direct',
    p_guests => 1,
    p_guest_name => 'Bad dates',
    p_occurred_on => '2027-08-05',
    p_amount_cents => 5000,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => null,
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => null,
    p_cleaning_cents => null
  )$$,
  '23514', null, 'A stay must end after it starts');
select throws_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-08-01',
    p_stay_end => '2027-08-02',
    p_channel => 'direct',
    p_guests => 1,
    p_guest_name => 'Zero',
    p_occurred_on => '2027-08-01',
    p_amount_cents => 0,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => null,
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => null,
    p_cleaning_cents => null
  )$$,
  '23514', null, 'A zero amount is rejected');
select is((select count(*)::int from public.finance_entries where counterparty in ('Bad USD', 'Bad dates', 'Zero')), 0,
  'Rejected calls leave no entries behind');

-- Unit checks: unknown unit and a unit of another org.
select throws_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => '00000000-0000-4000-8000-0000000000ff',
    p_stay_start => '2027-09-01',
    p_stay_end => '2027-09-02',
    p_channel => 'direct',
    p_guests => 1,
    p_guest_name => 'Ghost',
    p_occurred_on => '2027-09-01',
    p_amount_cents => 5000,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => null,
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => null,
    p_cleaning_cents => null
  )$$,
  '42501', null, 'An unknown unit is rejected');
select throws_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000002',
    p_stay_start => '2027-09-01',
    p_stay_end => '2027-09-02',
    p_channel => 'direct',
    p_guests => 1,
    p_guest_name => 'Foreign',
    p_occurred_on => '2027-09-01',
    p_amount_cents => 5000,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => null,
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => null,
    p_cleaning_cents => null
  )$$,
  '42501', null, 'A unit of another org is rejected (its published row is visible, but not writable)');

select throws_ok($$select public.create_rental_entries(
    p_org_id => 'ff24bacc-47d2-40bc-9210-f860e98892fd', p_unit_id => 'ee204001-0000-4000-8000-000000000001', p_stay_start => '2027-09-01',
    p_stay_end => '2027-09-02', p_channel => 'direct', p_occurred_on => '2027-09-01', p_amount_cents => 5000, p_currency => 'PEN')$$,
  '42501', null, 'A unit that does not belong to the stated org is rejected (the session org must match)');
select throws_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_unit_id => 'ee204001-0000-4000-8000-000000000001', p_stay_start => '2027-09-10',
    p_stay_end => '2027-09-11', p_channel => 'direct', p_occurred_on => '2027-09-10', p_amount_cents => 5000, p_currency => 'PEN',
    p_receipt_path => 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/9a9a9a9a-0000-4000-8000-000000000001.pdf')$$,
  '42501', null, 'A receipt that does not exist is rejected');
select is((select payment_method::text from public.finance_entries where related_entry_id = (select rental_id from usd_result)), null,
  'The commission of a direct rental is not marked as paid through a platform');

-- ─── Saywa staff ────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;

create temp table staff_result (rental_id uuid);
grant all on staff_result to authenticated;
insert into staff_result
select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-10-01',
    p_stay_end => '2027-10-03',
    p_channel => 'booking',
    p_guests => 2,
    p_guest_name => 'Staff Guest',
    p_occurred_on => '2027-10-03',
    p_amount_cents => 60000,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => 'cash',
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => 9000,
    p_cleaning_cents => 5000
  );
select is((select count(*)::int from public.finance_entries where created_by = 'c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40'::uuid), 3,
  'Staff registers a rental with its two costs');
select is((select count(*)::int from public.finance_entries where created_by is distinct from 'c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40'::uuid), 0,
  'Staff sees only the entries they created');
select is((select count(*)::int from public.finance_entries where counterparty = 'Guest One'), 0, 'Staff does not see the owner''s rentals');
select is((select created_by from public.finance_entries where id = (select rental_id from staff_result)),
  'c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40'::uuid, 'created_by is the staff member');

-- ─── Another organization ───────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-11-01',
    p_stay_end => '2027-11-02',
    p_channel => 'direct',
    p_guests => 1,
    p_guest_name => 'Intruder',
    p_occurred_on => '2027-11-01',
    p_amount_cents => 5000,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => null,
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => null,
    p_cleaning_cents => null
  )$$,
  '42501', null, 'Another org cannot register a rental on Saywa''s unit');
select is((select count(*)::int from public.finance_entries where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 0,
  'Another org sees none of Saywa''s entries');

-- ─── anon ───────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select throws_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-11-01',
    p_stay_end => '2027-11-02',
    p_channel => 'direct',
    p_guests => 1,
    p_guest_name => 'Anon',
    p_occurred_on => '2027-11-01',
    p_amount_cents => 5000,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => null,
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => null,
    p_cleaning_cents => null
  )$$,
  '42501', null, 'anon cannot call the function');

-- ─── Atomicity: a late failure rolls back the rental too ────────────────────
reset role;
-- Break the built-in lookup (entries already reference the category, so rename its key instead of deleting it).
update public.finance_categories set system_key = null where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'platform_commission';
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select throws_ok($$select public.create_rental_entries(
    p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817',
    p_unit_id => 'ee204001-0000-4000-8000-000000000001',
    p_stay_start => '2027-12-01',
    p_stay_end => '2027-12-02',
    p_channel => 'direct',
    p_guests => 1,
    p_guest_name => 'Half done',
    p_occurred_on => '2027-12-01',
    p_amount_cents => 5000,
    p_currency => 'PEN',
    p_fx_rate_pen => null,
    p_payment_method => null,
    p_receipt_path => null,
    p_note => null,
    p_commission_cents => 1000,
    p_cleaning_cents => null
  )$$,
  '42501', null, 'A missing commission category aborts the whole registration');
select is((select count(*)::int from public.finance_entries where counterparty = 'Half done'), 0,
  'The rental inserted before the failure was rolled back');

select * from finish();
rollback;
