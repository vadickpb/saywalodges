-- SD-421 (part 3): per-house price ranges. The figures match lib/domain/pricing-ranges.test.ts (same scenario, hand-computed).
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-..., owner a3b45db1-..., staff c5d77e30-..., Demo owner bd6a1c86-...
-- 2050-03-04 is a Friday; no seeded season reaches 2050. Base rate 100.00, weekend (Fri/Sat) 120.00, 2 included guests.
begin;
select plan(12);

insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests) values
  ('ee421000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Range Unit', 'entire_place', 4, 2);
insert into public.unit_rates (org_id, property_id, unit_id, season_id, nightly_cents, weekend_nightly_cents, extra_guest_cents, min_nights) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee421000-0000-4000-8000-000000000001', null, 10000, 12000, 2000, 1);

create function pg_temp.acc(p_in date, p_out date) returns text language sql stable as $$
  select coalesce(private.price_stay('ee421000-0000-4000-8000-000000000001', p_in, p_out, 2)->'breakdown'->>'accommodationCents',
                  private.price_stay('ee421000-0000-4000-8000-000000000001', p_in, p_out, 2)->>'error') $$;

select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.set_unit_price_range(uuid,uuid,date,date,integer,integer)'::regprocedure),
  'set_unit_price_range is SECURITY DEFINER with an empty search_path');
select ok(not has_function_privilege('anon', 'public.set_unit_price_range(uuid,uuid,date,date,integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.clear_unit_price_range(uuid,uuid,date,date)', 'EXECUTE'), 'anon cannot change prices');

select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select throws_ok($$select public.set_unit_price_range('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee421000-0000-4000-8000-000000000001', '2050-03-04', '2050-03-07', 20000, null)$$,
  '42501', 'not allowed', 'a member of another organization cannot change the price');
reset role;

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select throws_ok($$select public.set_unit_price_range('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee421000-0000-4000-8000-000000000001', '2050-03-07', '2050-03-04', 20000, null)$$,
  '22023', 'invalid range', 'an empty or reversed range is refused');
select lives_ok($$select public.set_unit_price_range('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee421000-0000-4000-8000-000000000001', '2050-03-04', '2050-03-07', 20000, null)$$,
  'a staff member sets 200.00 for Fri-Sun');
reset role;
select is(pg_temp.acc('2050-03-04', '2050-03-07'), '60000', 'the range replaces the weekday and the weekend price: 3 x 200.00');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select public.set_unit_price_range('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee421000-0000-4000-8000-000000000001', '2050-03-05', '2050-03-06', 30000, null);
reset role;
select is((select count(*)::int from public.unit_price_overrides where unit_id = 'ee421000-0000-4000-8000-000000000001'), 3,
  'a range inside another splits it: before, new and after');
select is(pg_temp.acc('2050-03-04', '2050-03-07'), '70000', '200.00 + 300.00 + 200.00');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select public.clear_unit_price_range('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee421000-0000-4000-8000-000000000001', '2050-03-04', '2050-03-06');
reset role;
select is(pg_temp.acc('2050-03-04', '2050-03-07'), '44000', 'cleared dates go back to the weekend rate (120.00 + 120.00); only Sunday keeps 200.00');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select public.set_unit_price_range('bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee421000-0000-4000-8000-000000000001', '2050-04-01', '2050-04-10', 9000, 3);
reset role;
select is(private.price_stay('ee421000-0000-4000-8000-000000000001', '2050-04-02', '2050-04-04', 2)->>'requiredNights', '3',
  'a range can set its own minimum stay');
select throws_ok($$insert into public.unit_price_overrides (org_id, property_id, unit_id, start_date, end_date, nightly_cents)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'ee421000-0000-4000-8000-000000000001', '2050-04-05', '2050-04-06', 1)$$,
  '23P01', null, 'two ranges of one house can never overlap');

select * from finish();
rollback;
