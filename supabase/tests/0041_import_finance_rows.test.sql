-- SD-420: owner-only, atomic, idempotent CSV import of manual income/expenses into the finance ledger.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., Saywa owner a3b45db1-..., staff c5d77e30-..., Demo owner bd6a1c86-... (org ff24bacc-...).
begin;
select plan(15);

insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active) values
  ('ee420000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'CSV Unit', 'room', 4, 4, true);
create temp table res(k text, v jsonb);
grant all on res to public;

create function pg_temp.rows() returns jsonb language sql stable as $$
  select jsonb_build_array(
    jsonb_build_object('ref', 'aaaaaaaaaaaaaaaa', 'kind', 'expense', 'category', ' LIMPIEZA ', 'occurred_on', current_date - 10,
      'amount_cents', 8000, 'currency', 'PEN', 'unit_id', 'ee420000-0000-4000-8000-000000000001', 'payment_method', 'cash',
      'counterparty', 'Rosa', 'note', 'Limpieza semanal'),
    jsonb_build_object('ref', 'bbbbbbbbbbbbbbbb', 'kind', 'expense', 'category', 'Categoría que no existe', 'occurred_on', current_date - 9,
      'amount_cents', 2500, 'currency', 'USD'),
    jsonb_build_object('ref', 'cccccccccccccccc', 'kind', 'income', 'category', 'Servicios extra', 'occurred_on', current_date - 8,
      'amount_cents', 4000, 'currency', 'PEN')) $$;

select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.import_finance_rows(uuid,jsonb,numeric)'::regprocedure),
  'import_finance_rows is SECURITY DEFINER with an empty search_path');
select ok(not has_function_privilege('anon', 'public.import_finance_rows(uuid,jsonb,numeric)', 'EXECUTE'), 'anon cannot execute it');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select throws_ok($$select public.import_finance_rows('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), 3.7)$$,
  '42501', 'not allowed', 'staff cannot import');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.import_finance_rows('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), 3.7)$$,
  '42501', 'not allowed', 'owner of another org cannot import');
reset role;

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select throws_ok($$select public.import_finance_rows('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), null)$$,
  '22023', 'exchange rate required', 'USD without exchange rate is rejected');
select throws_ok($$select public.import_finance_rows('bf88f504-051f-4fdc-ab73-4fa12d715817',
  jsonb_build_array(jsonb_build_object('ref','dddddddddddddddd','kind','expense','occurred_on',current_date + 5,'amount_cents',100,'currency','PEN')), null)$$,
  '22023', 'invalid row', 'a future date is rejected');
select throws_ok($$select public.import_finance_rows('bf88f504-051f-4fdc-ab73-4fa12d715817',
  jsonb_build_array(jsonb_build_object('ref','dddddddddddddddd','kind','expense','occurred_on',(now() at time zone 'America/Lima')::date,'amount_cents',100,'currency','PEN',
  'unit_id','ee999999-0000-4000-8000-000000000001')), null)$$,
  '42501', 'not allowed', 'a unit of nobody is rejected');

insert into res select 'first', public.import_finance_rows('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), 3.7);
select is((select v from res where k = 'first'), '{"inserted":3,"duplicates":0,"uncategorized":1}'::jsonb, 'first import inserts 3, one uncategorised');
reset role;

select is((select c.system_key from public.finance_entries e join public.finance_categories c on c.id = e.category_id
            where e.external_ref = 'csv:aaaaaaaaaaaaaaaa' and e.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'),
  'cleaning', 'category matched by name ignoring case and spaces');
select is((select c.system_key from public.finance_entries e join public.finance_categories c on c.id = e.category_id
            where e.external_ref = 'csv:bbbbbbbbbbbbbbbb' and e.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'),
  'other_expense', 'unknown category falls back to Otros egresos');
select is((select amount_pen_cents from public.finance_entries where external_ref = 'csv:bbbbbbbbbbbbbbbb' and org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'),
  9250::bigint, 'USD converted with the given rate');
select is((select source::text || '/' || coalesce(created_by::text, 'null') from public.finance_entries where external_ref = 'csv:cccccccccccccccc' and org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'),
  'csv_import/null', 'source csv_import and no creator');

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
insert into res select 'second', public.import_finance_rows('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(), 3.7);
select is((select v from res where k = 'second'), '{"inserted":0,"duplicates":3,"uncategorized":0}'::jsonb, 'reimport adds nothing');
reset role;
select is((select count(*)::int from public.finance_entries where source = 'csv_import' and org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 3, 'still 3 rows');
select is((select count(*)::int from public.finance_entries where source = 'csv_import' and org_id <> 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 0, 'nothing leaked to another org');

select * from finish();
rollback;
