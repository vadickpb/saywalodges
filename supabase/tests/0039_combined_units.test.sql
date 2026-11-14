-- SD-212: combined units (villa = house A + house B). Shadows are written by triggers under the same exclusion constraint.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-..., owner a3b45db1-..., staff c5d77e30-...
-- Fixture units V (villa), A and B (houses). All dates are in 2060, far from seeded data.
begin;
select plan(17);

insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests) values
  ('ee212000-0000-4000-8000-00000000000a', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Combo A', 'entire_place', 4, 2),
  ('ee212000-0000-4000-8000-00000000000b', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Combo B', 'entire_place', 4, 2),
  ('ee212000-0000-4000-8000-0000000000f0', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Combo Villa', 'entire_place', 8, 4);

create temp table res(k text, v uuid);
grant all on res to public;

select ok(not has_function_privilege('anon', 'public.set_unit_components(uuid,uuid,uuid[])', 'EXECUTE'), 'anon cannot define combinations');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.set_unit_components(uuid,uuid,uuid[])'::regprocedure),
  'set_unit_components is SECURITY DEFINER with an empty search_path');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select throws_ok($$select public.set_unit_components('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-0000000000f0', array['ee212000-0000-4000-8000-00000000000a']::uuid[])$$,
  '42501', 'not allowed', 'staff cannot define combinations');
reset role;

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$select public.set_unit_components('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-0000000000f0', array['ee212000-0000-4000-8000-00000000000a', 'ee212000-0000-4000-8000-00000000000b']::uuid[])$$,
  'the owner makes the villa out of A and B');
select throws_ok($$select public.set_unit_components('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-00000000000a', array['ee212000-0000-4000-8000-00000000000b']::uuid[])$$,
  '23514', null, 'a part cannot itself be a combination (no chains)');

-- Villa occupied -> both houses occupied.
select lives_ok($$insert into res select 'v1', public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-0000000000f0', '2060-05-01', '2060-05-04', 'Villa')$$,
  'a villa block is written');
reset role;
select is((select count(*)::int from public.calendar_blocks b join res r on r.k = 'v1' and b.derived_from = r.v where not b.is_echo), 2, 'it occupies both houses (down shadows)');

set local role authenticated;
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-00000000000a', '2060-05-03', '2060-05-05', null)$$,
  '23P01', null, 'a house cannot be blocked while the villa is');
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-0000000000f0', '2060-05-03', '2060-05-06', null)$$,
  '23P01', null, 'the villa cannot overlap a block that is already there');

-- Both houses at the same time is normal business; each leaves an echo on the villa and they must not collide.
select lives_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-00000000000a', '2060-05-04', '2060-05-06', 'A'),
                         public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-00000000000b', '2060-05-04', '2060-05-06', 'B')$$,
  'house A and house B can be booked on the same dates');
reset role;
select is((select count(*)::int from public.calendar_blocks where unit_id = 'ee212000-0000-4000-8000-0000000000f0' and is_echo and period = daterange('2060-05-04', '2060-05-06')), 2,
  'the villa shows both as occupied (informational echoes)');

set local role authenticated;
select throws_ok($$select public.create_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-0000000000f0', '2060-05-05', '2060-05-07', null)$$,
  '23P01', null, 'the villa cannot be booked over a booked house');
select throws_ok($$select public.delete_manual_calendar_block('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from public.calendar_blocks where derived_from is not null limit 1))$$,
  '42501', null, 'a shadow cannot be deleted by hand');
reset role;

-- Releasing the real block releases its shadows.
delete from public.calendar_blocks where id = (select v from res where k = 'v1');
select is((select count(*)::int from public.calendar_blocks where note like 'Ocupada por «Combo Villa»'), 0, 'deleting the villa block frees both houses');

-- Moving a block moves its shadows.
update public.calendar_blocks set period = daterange('2060-06-10', '2060-06-12')
 where unit_id = 'ee212000-0000-4000-8000-00000000000a' and note = 'A';
select is((select period::text from public.calendar_blocks where unit_id = 'ee212000-0000-4000-8000-0000000000f0' and note = 'Ocupada por «Combo A»'), '[2060-06-10,2060-06-12)',
  'the echo follows the dates of its block');

-- Defining a combination over bookings that already collide is refused.
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$select public.set_unit_components('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee212000-0000-4000-8000-0000000000f0', array[]::uuid[])$$, 'the owner removes the combination');
reset role;
select is((select count(*)::int from public.calendar_blocks where derived_from is not null and unit_id in ('ee212000-0000-4000-8000-00000000000a', 'ee212000-0000-4000-8000-00000000000b', 'ee212000-0000-4000-8000-0000000000f0')), 0,
  'and every shadow and echo disappears');

select * from finish();
rollback;
