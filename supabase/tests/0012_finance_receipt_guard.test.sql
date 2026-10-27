-- SD-803 review fixes: receipt guard + delete_finance_entry. Ids from supabase/seed.sql:
--   orgs  Saywa bf88f504-..., Demo ff24bacc-...
--   users Saywa owner a3b45db1-..., Saywa staff c5d77e30-..., Demo owner bd6a1c86-...
--   unit  Saywa ee204001-...0001
begin;
select plan(28);
select set_config('storage.allow_delete_query', 'true', true);

create temp table cat as select org_id, system_key, id from public.finance_categories;
grant select on cat to authenticated;
create temp table ids (label text primary key, id uuid);
grant all on ids to authenticated;

-- Receipt objects, written as table owner: one by the owner, one by staff, one for a rental.
insert into storage.objects (bucket_id, name, owner_id) values
  ('finance-receipts', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000001.pdf', 'a3b45db1-7c15-4528-a4ba-be625665fb6d'),
  ('finance-receipts', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000002.jpg', 'c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40'),
  ('finance-receipts', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000003.pdf', 'a3b45db1-7c15-4528-a4ba-be625665fb6d'),
  -- Malformed names: only the table's format CHECK can stop these (they pass the guard because the objects exist).
  ('finance-receipts', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/ok.jpg', 'a3b45db1-7c15-4528-a4ba-be625665fb6d'),
  ('finance-receipts', 'ff24bacc-47d2-40bc-9210-f860e98892fd/receipts/aaaaaaaa-0000-4000-8000-0000000000a1.pdf', 'a3b45db1-7c15-4528-a4ba-be625665fb6d'),
  ('finance-receipts', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/../aaaaaaaa-0000-4000-8000-0000000000b1.pdf', 'a3b45db1-7c15-4528-a4ba-be625665fb6d');

-- Format CHECK, as table owner (the guard passes because the objects exist).
select throws_ok($$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-04-01', 1000, 'PEN', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/ok.jpg'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23514', null, 'The table rejects a receipt path that is not {org}/receipts/{uuid}.{ext}');
select throws_ok($$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-04-01', 1000, 'PEN', 'ff24bacc-47d2-40bc-9210-f860e98892fd/receipts/aaaaaaaa-0000-4000-8000-0000000000a1.pdf'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23514', null, 'The table rejects a receipt path under another org''s prefix');
select throws_ok($$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-04-01', 1000, 'PEN', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/../aaaaaaaa-0000-4000-8000-0000000000b1.pdf'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23514', null, 'The table rejects a receipt path with ..');

-- ─── Receipt guard: Saywa owner ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select lives_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, counterparty, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-04-01', 1000, 'PEN', 'Owner receipt',
      'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000001.pdf'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  'The owner attaches a receipt that exists');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-04-01', 1000, 'PEN',
      'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-0000000000ff.pdf'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '42501', null, 'A well-formed receipt path with no object behind it is rejected');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-04-01', 1000, 'PEN',
      'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/ok.jpg'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23514', null, 'A receipt object the owner can see is still rejected when its path is not {org}/receipts/{uuid}.{ext}');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-04-01', 1000, 'PEN',
      'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000001.pdf'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23505', null, 'One receipt object cannot back two entries');

-- ─── Receipt guard: Saywa staff ─────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;

select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-04-02', 1000, 'PEN',
      'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000001.pdf'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '42501', null, 'Staff cannot attach a receipt the owner uploaded (not visible to them)');
select lives_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, counterparty, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-04-02', 1000, 'PEN', 'Staff receipt',
      'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000002.jpg'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  'Staff attaches the receipt they uploaded');
select throws_ok(
  $$update public.finance_entries set receipt_path = 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000001.pdf'
     where counterparty = 'Staff receipt'$$,
  '42501', null, 'Staff cannot re-point their entry at someone else''s receipt');
select results_eq(
  $$update public.finance_entries set note = 'edited' where counterparty = 'Staff receipt' returning note$$,
  $$values ('edited'::text)$$, 'Editing other fields does not re-run the receipt check');

-- ─── delete_finance_entry: Saywa owner ──────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

insert into ids
select 'rental', public.create_rental_entries(
  p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_unit_id => 'ee204001-0000-4000-8000-000000000001',
  p_stay_start => '2027-06-01', p_stay_end => '2027-06-03', p_channel => 'airbnb', p_occurred_on => '2027-06-03',
  p_amount_cents => 90000, p_currency => 'PEN', p_commission_cents => 13000, p_cleaning_cents => 7000,
  p_receipt_path => 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000003.pdf'
);
select is((select count(*)::int from public.finance_entries where related_entry_id = (select id from ids where label = 'rental')), 2,
  'The rental was registered with two linked costs');

-- Deleting only a cost keeps the rental.
select lives_ok($$select public.delete_finance_entry(p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_entry_id => (select id from public.finance_entries where related_entry_id = (select id from ids where label = 'rental') limit 1))$$,
  'Deleting one linked cost works');
select is((select count(*)::int from public.finance_entries where id = (select id from ids where label = 'rental')), 1,
  'Deleting a cost does not delete the rental');

select results_eq(
  $$select unnest(public.delete_finance_entry(p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_entry_id => (select id from ids where label = 'rental')))$$,
  $$values ('bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/aaaaaaaa-0000-4000-8000-000000000003.pdf'::text)$$,
  'Deleting a rental returns the receipt paths to clean up');
select is((select count(*)::int from public.finance_entries where id = (select id from ids where label = 'rental')
            or related_entry_id = (select id from ids where label = 'rental')), 0,
  'The rental and its remaining linked costs are gone');
select throws_ok($$select public.delete_finance_entry(p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_entry_id => '00000000-0000-4000-8000-0000000000ff')$$,
  '42501', null, 'Deleting an unknown entry raises');

-- An owner entry for the staff / other-org checks below.
insert into ids
select 'owner_entry', id from (
  select e.id from public.finance_entries e where e.counterparty = 'Owner receipt'
) x;

-- ─── delete_finance_entry: Saywa staff ──────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;

select throws_ok($$select public.delete_finance_entry(p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_entry_id => (select id from ids where label = 'owner_entry'))$$,
  '42501', null, 'Staff cannot delete an entry created by the owner');
insert into ids
select 'staff_rental', public.create_rental_entries(
  p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_unit_id => 'ee204001-0000-4000-8000-000000000001',
  p_stay_start => '2027-07-01', p_stay_end => '2027-07-02', p_channel => 'direct', p_occurred_on => '2027-07-02',
  p_amount_cents => 20000, p_currency => 'PEN', p_commission_cents => 1000, p_cleaning_cents => 2000
);
select lives_ok($$select public.delete_finance_entry(p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_entry_id => (select id from ids where label = 'staff_rental'))$$,
  'Staff deletes their own rental with its costs');
select is((select count(*)::int from public.finance_entries where id = (select id from ids where label = 'staff_rental')
            or related_entry_id = (select id from ids where label = 'staff_rental')), 0,
  'The staff rental and its costs are gone');

-- The session org is part of the call: a different org id deletes nothing, even for an owner.
reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select throws_ok($$select public.delete_finance_entry(p_org_id => 'ff24bacc-47d2-40bc-9210-f860e98892fd', p_entry_id => (select id from ids where label = 'owner_entry'))$$,
  '42501', null, 'Stating another org id deletes nothing, even for the entry''s owner');
select is((select count(*)::int from public.finance_entries where id = (select id from ids where label = 'owner_entry')), 1,
  'The entry is still there after a mismatched-org delete');

-- A cost the owner linked to a staff rental survives when staff deletes that rental (RLS hides it, the link is cleared).
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
insert into ids
select 'staff_rental2', public.create_rental_entries(
  p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_unit_id => 'ee204001-0000-4000-8000-000000000001',
  p_stay_start => '2027-08-01', p_stay_end => '2027-08-02', p_channel => 'direct', p_occurred_on => '2027-08-02', p_amount_cents => 15000, p_currency => 'PEN'
);
reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, counterparty, related_entry_id)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-08-02', 4321, 'PEN', 'Owner cost on staff rental', (select id from ids where label = 'staff_rental2')
from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'maintenance';

reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select lives_ok($$select public.delete_finance_entry(p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_entry_id => (select id from ids where label = 'staff_rental2'))$$,
  'Staff deletes their rental even though the owner linked a cost to it');
reset role;
select results_eq($$select related_entry_id is null from public.finance_entries where counterparty = 'Owner cost on staff rental'$$,
  $$values (true)$$, 'The owner''s linked cost survived, unlinked');

reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.delete_finance_entry(p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_entry_id => (select id from ids where label = 'owner_entry'))$$,
  '42501', null, 'Another org cannot delete Saywa''s entry');

reset role;
select ok(not has_function_privilege('anon', 'public.delete_finance_entry(uuid, uuid)', 'execute'), 'anon has no EXECUTE on delete_finance_entry');
select ok(has_function_privilege('authenticated', 'public.delete_finance_entry(uuid, uuid)', 'execute'), 'authenticated can execute delete_finance_entry');

reset role;
select is((select count(*)::int from public.finance_entries where id = (select id from ids where label = 'owner_entry')), 1,
  'The owner''s entry survived every unauthorised delete');

select * from finish();
rollback;
