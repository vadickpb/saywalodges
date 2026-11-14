-- SD-211: unit showcase columns and spaces that belong to a unit.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-..., staff c5d77e30-..., Demo owner bd6a1c86-...
begin;
select plan(10);

insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active) values
  ('ee211000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Showcase Active', 'entire_place', 4, 2, true),
  ('ee211000-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Showcase Inactive', 'entire_place', 4, 2, false);
insert into public.spaces (id, org_id, property_id, key, category, label_es, label_en, unit_id) values
  ('5a211000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'sc-bedroom', (enum_range(null::public.space_category))[1], 'Dormitorio', 'Bedroom', 'ee211000-0000-4000-8000-000000000001');

select is((select showcase_type || '|' || bedrooms || '|' || beds || '|' || bathrooms || '|' || description_es from public.units where id = 'ee211000-0000-4000-8000-000000000001'),
  'house|1|1|1|', 'a new unit gets sensible showcase defaults');
select throws_ok($$update public.units set showcase_type = 'castle' where id = 'ee211000-0000-4000-8000-000000000001'$$, '23514', null, 'the unit type is restricted');
select throws_ok($$update public.units set beds = -1 where id = 'ee211000-0000-4000-8000-000000000001'$$, '23514', null, 'counts cannot be negative');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select lives_ok($$update public.units set description_es = 'Casa con vista al valle', bedrooms = 3, beds = 5, sort_order = 2 where id = 'ee211000-0000-4000-8000-000000000001'$$,
  'a staff member edits the showcase columns');
select throws_ok($$update public.units set org_id = 'bd6a1c86-01e2-40a4-ba79-4e28b373e880' where id = 'ee211000-0000-4000-8000-000000000001'$$, '42501', null, 'the tenant column stays immutable');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*)::int from public.units where id in ('ee211000-0000-4000-8000-000000000001', 'ee211000-0000-4000-8000-000000000002')), 1,
  'anon sees the active unit only (its description is public by design), never the inactive one');
select is((select description_es from public.units where id = 'ee211000-0000-4000-8000-000000000001'), 'Casa con vista al valle', 'the public description is readable');
reset role;

select fk_ok('public', 'spaces', array['unit_id', 'property_id'], 'public', 'units', array['id', 'property_id'], 'a space can only point to a unit of its own property');
delete from public.units where id = 'ee211000-0000-4000-8000-000000000001';
select is((select unit_id from public.spaces where id = '5a211000-0000-4000-8000-000000000001'), null, 'deleting a unit turns its spaces into common areas');
select is((select count(*)::int from public.spaces where id = '5a211000-0000-4000-8000-000000000001'), 1, 'and keeps the space (and its photos)');

select * from finish();
rollback;
