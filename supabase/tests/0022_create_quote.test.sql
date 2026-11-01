-- SD-402: public.create_quote (session RPC) and properties.deposit_percent (ADR 0009).
-- Ids from supabase/seed.sql:
--   orgs  Saywa bf88f504-051f-4fdc-ab73-4fa12d715817, Demo ff24bacc-47d2-40bc-9210-f860e98892fd
--   users Saywa owner a3b45db1-7c15-4528-a4ba-be625665fb6d, Saywa staff c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40,
--         Demo owner bd6a1c86-01e2-40a4-ba79-4e28b373e880
--   units Saywa ee204001-...0001 (property 131583b5-785e-4127-81f0-e097163c5654, USD, max 13 guests),
--         Demo  ee204001-...0002 (property 57f914ac-3890-47c1-9d6d-1492782cf712, PEN, max 4 guests)
-- Dates are relative to today in Lima so the file does not expire.
begin;
select plan(43);

create temp table res (k text primary key, v jsonb);
grant all on res to anon, authenticated, service_role;

-- ─── Catalog ────────────────────────────────────────────────────────────────
select has_column('public', 'properties', 'deposit_percent', 'properties.deposit_percent exists');
select is((select deposit_percent from public.properties where id = '131583b5-785e-4127-81f0-e097163c5654'), 50,
  'The deposit policy defaults to 50 %');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
  where oid = 'public.create_quote(uuid,uuid,date,date,integer,integer,integer,jsonb,integer)'::regprocedure),
  'create_quote is SECURITY DEFINER with an empty search_path');
select ok(has_function_privilege('authenticated', 'public.create_quote(uuid,uuid,date,date,integer,integer,integer,jsonb,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.create_quote(uuid,uuid,date,date,integer,integer,integer,jsonb,integer)', 'EXECUTE'),
  'authenticated can execute create_quote, anon cannot');
select throws_ok($$update public.properties set deposit_percent = 101 where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '23514', null, 'A deposit above 100 % is rejected');

-- ─── Fixtures (table owner) ─────────────────────────────────────────────────
insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests, active)
values ('ee204001-0000-4000-8000-0000000000a1', 'bf88f504-051f-4fdc-ab73-4fa12d715817',
  '131583b5-785e-4127-81f0-e097163c5654', 'Inactive room', 'room', 2, 1, false);

-- ─── Saywa owner: happy path ────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);

select lives_ok($$insert into res select 'a', public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  'An owner creates a quote');
select is((select length(token) from public.quotes where id = (select (v ->> 'quote_id')::uuid from res where k = 'a')), 64,
  'The token has 64 characters');
select ok(exists (select 1 from public.quotes q where q.id = (select (v ->> 'quote_id')::uuid from res where k = 'a')
  and q.currency = 'USD' and q.total_cents = 66000 and q.deposit_cents = 33000 and q.guests = 4
  and q.created_by = 'a3b45db1-7c15-4528-a4ba-be625665fb6d'
  and q.property_id = '131583b5-785e-4127-81f0-e097163c5654' and q.expires_at = now() + interval '72 hours'),
  'The stored row carries the property currency, the amounts, the author and a 72 h expiry');
select lives_ok($$insert into res select 'b', public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  'The same scenario can be quoted again');
select isnt((select v ->> 'token' from res where k = 'a'), (select v ->> 'token' from res where k = 'b'),
  'Every quote gets its own token');

-- ─── Staff is a member too ──────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
select lives_ok($$insert into res select 'c', public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 40,
  (now() at time zone 'America/Lima')::date + 42, 2, 44000, 22000,
  '{"accommodationCents":40000,"feesCents":4000,"totalCents":44000,"depositPercent":50}'::jsonb)$$,
  'A staff member of the org can create a quote');

-- ─── Cross-tenant isolation ─────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '42501', null, 'A member of another org cannot quote in Saywa');
select throws_ok($$select public.create_quote('ff24bacc-47d2-40bc-9210-f860e98892fd',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '42501', null, 'Demo owner cannot use a Saywa unit under the Demo org');

-- ─── Saywa owner: rejections ────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000002', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 2, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '42501', null, 'A unit of another org is rejected even with the caller''s own org id');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-0000000000a1', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 2, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22023', null, 'An inactive unit cannot be quoted');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 14, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22023', null, 'More guests than the unit capacity is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 0, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22023', null, 'Zero guests is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date - 1,
  (now() at time zone 'America/Lima')::date + 2, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22007', null, 'A stay that starts in the past is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 30, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22007', null, 'A zero-night stay is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 400, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22007', null, 'A stay longer than 366 nights is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb, 0)$$,
  '22023', null, 'A validity of 0 hours is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb, 169)$$,
  '22023', null, 'A validity above 168 hours is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66001, 33001,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22023', null, 'A total that disagrees with the breakdown is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33001,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22023', null, 'A deposit that is not total x policy is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 26400,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":40}'::jsonb)$$,
  '22023', null, 'A breakdown that claims another deposit percent than the property policy is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000, '[]'::jsonb)$$,
  '22023', null, 'A breakdown that is not an object is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22023', null, 'A breakdown without feesCents is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', null,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22004', null, 'A null argument is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50,"padding":"x"}'::jsonb)$$,
  '22023', null, 'A breakdown with an unknown key is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  (select jsonb_build_object('accommodationCents', 60000, 'feesCents', 6000, 'totalCents', 66000,
    'depositPercent', 50, 'nights', jsonb_agg(i)) from generate_series(1, 367) as i))$$,
  '22023', null, 'A breakdown with more than 366 nights is rejected');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":59999.5,"feesCents":6000.5,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22023', null, 'Fractional cents in the breakdown are rejected');
select throws_ok($$insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
  total_cents, deposit_cents, expires_at)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', rpad('direct', 40, 'x'), '2030-01-01', '2030-01-02', 1, 'USD', 1, 0,
  now() + interval '1 day')$$,
  '42501', null, 'Members still cannot insert into quotes directly');

-- ─── anon ───────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 33, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '42501', null, 'anon cannot execute create_quote');
reset role;

-- ─── Policy changes and rounding ────────────────────────────────────────────
update public.properties set deposit_percent = 30 where id = '131583b5-785e-4127-81f0-e097163c5654';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select lives_ok($$insert into res select 'p30', public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 50,
  (now() at time zone 'America/Lima')::date + 53, 4, 66000, 19800,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":30}'::jsonb)$$,
  'A new policy of 30 % is honoured');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 50,
  (now() at time zone 'America/Lima')::date + 53, 4, 66000, 33000,
  '{"accommodationCents":60000,"feesCents":6000,"totalCents":66000,"depositPercent":50}'::jsonb)$$,
  '22023', null, 'The old 50 % deposit is rejected once the policy is 30 %');
reset role;
update public.properties set deposit_percent = 50 where id = '131583b5-785e-4127-81f0-e097163c5654';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select lives_ok($$insert into res select 'round', public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 60,
  (now() at time zone 'America/Lima')::date + 61, 1, 101, 51,
  '{"accommodationCents":101,"feesCents":0,"totalCents":101,"depositPercent":50}'::jsonb)$$,
  'A half cent rounds up: 50 % of 101 is 51');
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 60,
  (now() at time zone 'America/Lima')::date + 61, 1, 101, 50,
  '{"accommodationCents":101,"feesCents":0,"totalCents":101,"depositPercent":50}'::jsonb)$$,
  '22023', null, 'Rounding the half cent down is rejected');

-- ─── Caps per org: quotes created per day, then quotes open at the same time ─
reset role;
insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
  total_cents, deposit_cents, created_at, expires_at)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', rpad('day' || i, 40, 'x'), '2031-01-01', '2031-01-02', 1, 'USD', 1000, 500,
  now() - interval '2 hours', now() - interval '1 hour'
from generate_series(1, 300) as i;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 70,
  (now() at time zone 'America/Lima')::date + 71, 1, 101, 51,
  '{"accommodationCents":101,"feesCents":0,"totalCents":101,"depositPercent":50}'::jsonb)$$,
  '54000', null, 'An org that created 300 quotes today cannot create more, even if none is still open');
reset role;
delete from public.quotes where token like 'day%';
insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
  total_cents, deposit_cents, created_at, expires_at)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654',
  'ee204001-0000-4000-8000-000000000001', rpad('cap' || i, 40, 'x'), '2031-01-01', '2031-01-02', 1, 'USD', 1000, 500,
  now() - interval '2 days', now() + interval '1 day'
from generate_series(1, 500) as i;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select throws_ok($$select public.create_quote('bf88f504-051f-4fdc-ab73-4fa12d715817',
  'ee204001-0000-4000-8000-000000000001', (now() at time zone 'America/Lima')::date + 70,
  (now() at time zone 'America/Lima')::date + 71, 1, 101, 51,
  '{"accommodationCents":101,"feesCents":0,"totalCents":101,"depositPercent":50}'::jsonb)$$,
  '54000', null, 'An org with 500 open quotes cannot create more');
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
select lives_ok($$insert into res select 'demo', public.create_quote('ff24bacc-47d2-40bc-9210-f860e98892fd',
  'ee204001-0000-4000-8000-000000000002', (now() at time zone 'America/Lima')::date + 30,
  (now() at time zone 'America/Lima')::date + 32, 2, 20000, 10000,
  '{"accommodationCents":18000,"feesCents":2000,"totalCents":20000,"depositPercent":50}'::jsonb)$$,
  'The cap is per org: another org can still create quotes');
select ok(exists (select 1 from public.quotes q where q.id = (select (v ->> 'quote_id')::uuid from res where k = 'demo')
  and q.currency = 'PEN'), 'The currency comes from the property (PEN for Demo), not from the caller');
reset role;

-- ─── Only an owner changes the deposit policy ───────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
select throws_ok($$update public.properties set deposit_percent = 10 where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '42501', null, 'A staff member cannot change the deposit policy');
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select lives_ok($$update public.properties set deposit_percent = 40 where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  'An owner can change the deposit policy');
reset role;

select * from finish();
rollback;
