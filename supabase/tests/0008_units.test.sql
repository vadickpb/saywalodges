-- SD-204: real RLS/privileges, constraints and active inventory filtering.
begin;
select plan(29);

select has_table('public', 'units', 'Bookable units table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.units'::regclass), 'Units have RLS enabled');
select is((select count(*)::int from public.units), 2, 'Two organizations have seeded units');

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select results_eq(
  $$insert into public.units (org_id, property_id, name, kind, max_guests, included_guests)
    values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Second room','room',2,1) returning name$$,
  $$values ('Second room'::text)$$, 'A member creates a second unit in their own property');
select results_eq(
  $$update public.units set name='Updated room' where name='Second room' returning name$$,
  $$values ('Updated room'::text)$$, 'A member edits their unit');
select results_eq(
  $$update public.units set name='HACKED' where id='ee204001-0000-4000-8000-000000000002' returning id$$,
  $$select id from public.units where false$$, 'Foreign unit update affects zero rows');
select results_eq(
  $$delete from public.units where id='ee204001-0000-4000-8000-000000000002' returning id$$,
  $$select id from public.units where false$$, 'Foreign unit delete affects zero rows');
select throws_ok(
  $$insert into public.units (org_id,property_id,name,kind,max_guests,included_guests)
    values ('ff24bacc-47d2-40bc-9210-f860e98892fd','57f914ac-3890-47c1-9d6d-1492782cf712','Foreign','room',2,1)$$,
  '42501', null, 'Member cannot insert into another org');
select throws_ok(
  $$insert into public.units (org_id,property_id,name,kind,max_guests,included_guests)
    values ('bf88f504-051f-4fdc-ab73-4fa12d715817','57f914ac-3890-47c1-9d6d-1492782cf712','Mixed org','room',2,1)$$,
  '23503', null, 'Composite FK rejects own org with foreign property');
select throws_ok($$update public.units set org_id='ff24bacc-47d2-40bc-9210-f860e98892fd'$$,
  '42501', null, 'Org identity is not writable');
select throws_ok($$update public.units set property_id='57f914ac-3890-47c1-9d6d-1492782cf712'$$,
  '42501', null, 'Parent identity is not writable');
select throws_ok($$update public.units set name=' ' where id='ee204001-0000-4000-8000-000000000001'$$,
  '23514', null, 'Blank names rejected');
select throws_ok($$update public.units set name=repeat('x',201) where id='ee204001-0000-4000-8000-000000000001'$$,
  '23514', null, 'Overlong names rejected');
select throws_ok($$update public.units set max_guests=0 where id='ee204001-0000-4000-8000-000000000001'$$,
  '23514', null, 'Zero capacity rejected');
select throws_ok($$update public.units set included_guests=0 where id='ee204001-0000-4000-8000-000000000001'$$,
  '23514', null, 'Zero included guests rejected');
select throws_ok($$update public.units set included_guests=14 where id='ee204001-0000-4000-8000-000000000001'$$,
  '23514', null, 'Included guests cannot exceed capacity');
select throws_ok($$update public.units set kind='pool' where id='ee204001-0000-4000-8000-000000000001'$$,
  '22P02', null, 'Unknown kind rejected');
select results_eq($$delete from public.units where name='Updated room' returning name$$,
  $$values ('Updated room'::text)$$, 'A member deletes their own unit');
update public.units set active=false where id='ee204001-0000-4000-8000-000000000001';
select is((select count(*)::int from public.units where id='ee204001-0000-4000-8000-000000000001'),1,'Member sees their inactive unit');

reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;
select is((select count(*)::int from public.units where id='ee204001-0000-4000-8000-000000000001'),0,'Anon cannot see inactive units');
select is((select count(*)::int from public.units where id='ee204001-0000-4000-8000-000000000002'),1,'Anon can read active units of a published property');
select throws_ok($$update public.units set active=false$$,'42501',null,'Anon cannot update units');
select throws_ok($$delete from public.units$$,'42501',null,'Anon cannot delete units');
select throws_ok($$insert into public.units (org_id,property_id,name,kind,max_guests,included_guests)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817','131583b5-785e-4127-81f0-e097163c5654','Anon','room',2,1)$$,
  '42501',null,'Anon cannot insert units');
reset role;
update public.properties set published=false where id='57f914ac-3890-47c1-9d6d-1492782cf712';
-- Switch to demo owner: own unpublished inventory stays readable.
select set_config('request.jwt.claims','{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}',true);
set local role authenticated;
select is((select count(*)::int from public.units where id='ee204001-0000-4000-8000-000000000002'),1,'Member sees own unpublished inventory');
select is((select count(*)::int from public.units where org_id='bf88f504-051f-4fdc-ab73-4fa12d715817'),0,'Other org cannot read inactive inventory');
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role anon;
select is((select count(*)::int from public.units),0,'Anon cannot read unpublished inventory');
reset role;
select set_config('request.jwt.claims','{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}',true);
set local role authenticated;
update public.units set active=true where id='ee204001-0000-4000-8000-000000000001';
select is((select updated_at from public.units where id='ee204001-0000-4000-8000-000000000001'), now(), 'Member updates maintain updated_at');
select throws_ok($$update public.units set updated_at='2020-01-01'$$,'42501',null,'Member cannot forge timestamps');
select * from finish();
rollback;
