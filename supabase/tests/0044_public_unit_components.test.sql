-- SD-1119: anon reads the parts of an ACTIVE combination of a published property, nothing else, and cannot write.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-...
begin;
select plan(5);

insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active) values
  ('ee219000-0000-4000-8000-00000000000a', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Pub A', 'entire_place', 4, 2, true),
  ('ee219000-0000-4000-8000-00000000000b', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Pub B', 'entire_place', 4, 2, true),
  ('ee219000-0000-4000-8000-00000000000c', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Pub C', 'entire_place', 4, 2, true),
  ('ee219000-0000-4000-8000-00000000000d', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Pub D (inactive)', 'entire_place', 4, 2, false),
  ('ee219000-0000-4000-8000-0000000000f0', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Pub Villa', 'entire_place', 8, 4, true),
  ('ee219000-0000-4000-8000-0000000000f1', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Pub Villa Off', 'entire_place', 8, 4, false);
insert into public.unit_components (org_id, property_id, parent_unit_id, child_unit_id) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee219000-0000-4000-8000-0000000000f0', 'ee219000-0000-4000-8000-00000000000a'),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee219000-0000-4000-8000-0000000000f0', 'ee219000-0000-4000-8000-00000000000b'),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee219000-0000-4000-8000-0000000000f0', 'ee219000-0000-4000-8000-00000000000d'),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee219000-0000-4000-8000-0000000000f1', 'ee219000-0000-4000-8000-00000000000c');

update public.properties set published = true where id = '131583b5-785e-4127-81f0-e097163c5654';
set local role anon;
select is((select count(*)::int from public.unit_components where parent_unit_id = 'ee219000-0000-4000-8000-0000000000f0'), 2, 'anon sees the active parts of an active combination (the inactive part D stays hidden)');
select is((select count(*)::int from public.unit_components where parent_unit_id = 'ee219000-0000-4000-8000-0000000000f1'), 0, 'anon does not see the parts of an inactive combination');
select throws_ok($$select org_id from public.unit_components$$, '42501', null, 'anon cannot read org_id');
select throws_ok($$delete from public.unit_components$$, '42501', null, 'anon cannot delete');
reset role;
update public.properties set published = false where id = '131583b5-785e-4127-81f0-e097163c5654';
set local role anon;
select is((select count(*)::int from public.unit_components where parent_unit_id = 'ee219000-0000-4000-8000-0000000000f0'), 0, 'nothing is visible when the property is not published');
select * from finish();
rollback;
