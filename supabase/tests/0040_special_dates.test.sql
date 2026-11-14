-- SD-213: seasons flagged as special dates. Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-..., staff c5d77e30-...
begin;
select plan(7);

insert into public.seasons (id, org_id, property_id, name, start_date, end_date, priority) values
  ('5e213000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Año Nuevo test', '2061-12-30', '2062-01-03', 90);

select is((select is_special::text || '|' || public_name_es from public.seasons where id = '5e213000-0000-4000-8000-000000000001'), 'false|', 'seasons are not special by default');
select throws_ok($$update public.seasons set is_special = true where id = '5e213000-0000-4000-8000-000000000001'$$, '23514', null, 'a special date needs a public name');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select lives_ok($$update public.seasons set is_special = true, public_name_es = 'Año Nuevo', public_name_en = 'New Year' where id = '5e213000-0000-4000-8000-000000000001'$$,
  'a member flags a season as special with its public names');
select throws_ok($$update public.seasons set public_name_es = repeat('x', 121) where id = '5e213000-0000-4000-8000-000000000001'$$, '23514', null, 'the public name is bounded');
select throws_ok($$update public.seasons set org_id = 'bd6a1c86-01e2-40a4-ba79-4e28b373e880' where id = '5e213000-0000-4000-8000-000000000001'$$, '42501', null, 'the tenant column stays immutable');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select public_name_es from public.seasons where id = '5e213000-0000-4000-8000-000000000001'), 'Año Nuevo', 'anon reads the public name of a published property');
select is((select count(*)::int from public.seasons where is_special and property_id = '131583b5-785e-4127-81f0-e097163c5654'), 1, 'and can list the special dates');
reset role;

select * from finish();
rollback;
