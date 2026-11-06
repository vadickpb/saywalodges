-- SD-419: owner-only, atomic, idempotent import of Airbnb history into the finance ledger.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-...; Saywa owner a3b45db1-..., staff c5d77e30-...,
-- Demo owner bd6a1c86-... (org ff24bacc-...).
begin;
select plan(21);

insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active) values
  ('ee419000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Import Unit', 'room', 4, 4, true);
create temp table res(k text, v jsonb);
grant all on res to public;

create function pg_temp.rows() returns jsonb language sql stable as $$
  select jsonb_build_array(
    jsonb_build_object('ref', 'HMAAAA1111', 'unit_id', 'ee419000-0000-4000-8000-000000000001', 'stay_start', current_date - 70,
      'stay_end', current_date - 67, 'occurred_on', current_date - 66, 'guest', 'Ana Prueba', 'guests', 2,
      'currency', 'PEN', 'gross_cents', 10000, 'fee_cents', 1500),
    jsonb_build_object('ref', 'HMBBBB2222', 'unit_id', 'ee419000-0000-4000-8000-000000000001', 'stay_start', current_date - 50,
      'stay_end', current_date - 48, 'occurred_on', current_date - 47, 'guest', 'Beto Prueba',
      'currency', 'USD', 'gross_cents', 5000, 'fee_cents', 0)) $$;

select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.import_airbnb_history(uuid,jsonb,numeric)'::regprocedure),
  'import_airbnb_history is SECURITY DEFINER with an empty search_path');
select ok(not has_function_privilege('anon', 'public.import_airbnb_history(uuid,jsonb,numeric)', 'EXECUTE'), 'anon cannot execute it');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select throws_ok($$select public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), 3.7)$$,
  '42501', 'not allowed', 'staff cannot import');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), 3.7)$$,
  '42501', 'not allowed', 'the owner of another organization cannot import here');
reset role;

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$insert into res select 'i1', public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), 3.7)$$,
  'the owner imports two past stays');
select is((select v->>'inserted' from res where k = 'i1'), '2', 'two stays inserted');
select is((select v->>'commissions' from res where k = 'i1'), '1', 'one stay had a commission (the USD stay had none)');
select is((select count(*)::int || '/' || count(*) filter (where kind = 'expense') from public.finance_entries where source = 'airbnb_csv'), '2/0', 'two ledger rows, both incomes: the commission is never an expense');
select is((select note from public.finance_entries where external_ref = 'airbnb:HMAAAA1111'), 'Bruto 100.00 · Comisión Airbnb 15.00 PEN', 'the gross and the commission stay in the note');
select is((select channel::text || '|' || counterparty || '|' || (stay_end - stay_start)::text || '|' || amount_cents::text from public.finance_entries where external_ref = 'airbnb:HMAAAA1111'),
  'airbnb|Ana Prueba|3|8500', 'income keeps channel, guest, nights and the NET amount received');

select lives_ok($$insert into res select 'i2', public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), 3.7)$$, 'importing the same file again works');
select is((select v->>'duplicates' || '/' || (v->>'inserted') from res where k = 'i2'), '2/0', 'it reports duplicates and inserts nothing');
select is((select count(*)::int from public.finance_entries where source = 'airbnb_csv'), 2, 'the ledger did not grow');

select throws_ok($$select public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), null)$$,
  '22023', 'exchange rate required', 'USD rows need an exchange rate');
select is((select (public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', jsonb_build_array(jsonb_build_object(
  'ref', 'HMFUTURE99', 'unit_id', 'ee419000-0000-4000-8000-000000000001', 'stay_start', current_date + 5, 'stay_end', current_date + 7,
  'occurred_on', current_date, 'currency', 'PEN', 'gross_cents', 9000, 'fee_cents', 0)), null))->>'skipped_future'),
  '1', 'stays that have not ended are skipped (iCal covers them)');
select throws_ok($$select public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', jsonb_build_array(jsonb_build_object(
  'ref', 'bad ref!', 'unit_id', 'ee419000-0000-4000-8000-000000000001', 'stay_start', current_date - 9, 'stay_end', current_date - 8,
  'occurred_on', current_date - 8, 'currency', 'PEN', 'gross_cents', 9000)), null)$$, '22023', 'invalid row', 'a malformed confirmation code is refused');
select throws_ok($$select public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', jsonb_build_array(jsonb_build_object(
  'ref', 'HMFOREIGN1', 'unit_id', 'ee419000-0000-4000-8000-0000000000ff', 'stay_start', current_date - 9, 'stay_end', current_date - 8,
  'occurred_on', current_date - 8, 'currency', 'PEN', 'gross_cents', 9000)), null)$$, '42501', 'not allowed', 'a unit outside the organization is refused');
select throws_ok($$select public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', jsonb_build_array(
  jsonb_build_object('ref', 'HMATOMIC01', 'unit_id', 'ee419000-0000-4000-8000-000000000001', 'stay_start', current_date - 9, 'stay_end', current_date - 8,
    'occurred_on', current_date - 8, 'currency', 'PEN', 'gross_cents', 9000),
  jsonb_build_object('ref', 'x', 'unit_id', 'ee419000-0000-4000-8000-000000000001', 'stay_start', current_date - 9, 'stay_end', current_date - 8,
    'occurred_on', current_date - 8, 'currency', 'PEN', 'gross_cents', 9000)), null)$$, '22023', 'invalid row', 'one bad row fails the whole batch');
select is((select count(*)::int from public.finance_entries where external_ref = 'airbnb:HMATOMIC01'), 0, 'and nothing from that batch was written');
select is((select (public.import_airbnb_history('bf88f504-051f-4fdc-ab73-4fa12d715817', jsonb_build_array(jsonb_build_object(
  'ref', 'HMOVERLAP1', 'unit_id', 'ee419000-0000-4000-8000-000000000001', 'stay_start', current_date - 70, 'stay_end', current_date - 67,
  'occurred_on', current_date - 66, 'currency', 'PEN', 'gross_cents', 9000)), null))->>'skipped_overlap'),
  '1', 'a stay already in the ledger for the same unit and dates is skipped, not counted twice');
select is((select count(*)::int from public.finance_entries where external_ref = 'airbnb:HMOVERLAP1'), 0, 'and no second income was written');
reset role;
select * from finish();
rollback;
