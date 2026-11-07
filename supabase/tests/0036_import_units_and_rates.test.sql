-- SD-420: owner-only, atomic, idempotent import of units and base rates.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., Saywa owner a3b45db1-..., staff c5d77e30-..., Demo owner bd6a1c86-...
begin;
select plan(14);

create temp table res(k text, v jsonb);
grant all on res to public;
create function pg_temp.rows(p_nightly bigint default 15000) returns jsonb language sql stable as $$
  select jsonb_build_array(
    jsonb_build_object('name', 'Import Casa Uno', 'kind', 'entire_place', 'max_guests', 6, 'included_guests', 4,
      'nightly_cents', p_nightly, 'weekend_nightly_cents', 18000, 'extra_guest_cents', 2000, 'min_nights', 2),
    jsonb_build_object('name', 'Import Cuarto Dos', 'kind', 'room', 'max_guests', 2, 'included_guests', 2,
      'nightly_cents', 8000)) $$;

select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.import_units_and_rates(uuid,jsonb)'::regprocedure),
  'import_units_and_rates is SECURITY DEFINER with an empty search_path');
select ok(not has_function_privilege('anon', 'public.import_units_and_rates(uuid,jsonb)', 'EXECUTE'), 'anon cannot execute it');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select throws_ok($$select public.import_units_and_rates('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows())$$, '42501', 'not allowed', 'staff cannot import');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.import_units_and_rates('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows())$$, '42501', 'not allowed', 'the owner of another organization cannot import here');
reset role;

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$insert into res select 'i1', public.import_units_and_rates('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows())$$, 'the owner imports two units');
select is((select v->>'created' || '/' || (v->>'updated') from res where k = 'i1'), '2/0', 'both were created');
select is((select r.nightly_cents::text || '|' || r.weekend_nightly_cents::text || '|' || r.extra_guest_cents::text || '|' || r.min_nights::text
  from public.unit_rates r join public.units u on u.id = r.unit_id where u.name = 'Import Casa Uno' and r.season_id is null),
  '15000|18000|2000|2', 'the base rate was stored with its weekend, extra guest and minimum nights');

select lives_ok($$insert into res select 'i2', public.import_units_and_rates('bf88f504-051f-4fdc-ab73-4fa12d715817', pg_temp.rows(16000))$$, 're-importing works');
select is((select v->>'created' || '/' || (v->>'updated') from res where k = 'i2'), '0/2', 'the second run only updates');
select is((select count(*)::int from public.units where name like 'Import %'), 2, 'no duplicate units');
select is((select r.nightly_cents from public.unit_rates r join public.units u on u.id = r.unit_id where u.name = 'Import Casa Uno' and r.season_id is null), 16000, 'the rate was updated in place');

select throws_ok($$select public.import_units_and_rates('bf88f504-051f-4fdc-ab73-4fa12d715817', jsonb_build_array(
  jsonb_build_object('name', 'Import Cuarto Tres', 'kind', 'room', 'max_guests', 2, 'included_guests', 2, 'nightly_cents', 5000),
  jsonb_build_object('name', 'Import Malo', 'kind', 'room', 'max_guests', 2, 'included_guests', 3, 'nightly_cents', 5000)))$$,
  '22023', 'invalid row', 'included guests above the maximum fails the whole batch');
select is((select count(*)::int from public.units where name = 'Import Cuarto Tres'), 0, 'and nothing from that batch was written');
select throws_ok($$select public.import_units_and_rates('bf88f504-051f-4fdc-ab73-4fa12d715817', jsonb_build_array(
  jsonb_build_object('name', 'Repetida', 'kind', 'room', 'max_guests', 2, 'included_guests', 2, 'nightly_cents', 5000),
  jsonb_build_object('name', ' repetida ', 'kind', 'room', 'max_guests', 2, 'included_guests', 2, 'nightly_cents', 6000)))$$,
  '22023', 'invalid row', 'the same name twice in one file is refused');

select * from finish();
rollback;
