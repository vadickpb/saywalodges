-- SD-411 security fix: payment accounts are writable by the owner only.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-...; Saywa owner a3b45db1-..., Saywa staff c5d77e30-...,
-- Demo owner bd6a1c86-... (another organization).
begin;
select plan(13);

insert into public.property_payment_accounts (id, org_id, property_id, kind, holder_name, phone, currency) values
  ('a0270000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'yape', 'Titular Original', '51900000001', 'USD');

-- ─── Policies ───────────────────────────────────────────────────────────────
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'property_payment_accounts'
  and cmd in ('INSERT', 'UPDATE', 'DELETE') and coalesce(qual, '') || coalesce(with_check, '') like '%is_owner%'), 3,
  'insert, update and delete are all owner-only');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'property_payment_accounts'
  and cmd = 'SELECT' and qual like '%is_member%'), 1, 'reading stays open to members');

-- ─── Staff of the same organization ─────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select is((select count(*)::int from public.property_payment_accounts where id = 'a0270000-0000-4000-8000-000000000001'), 1, 'staff can still read the accounts');
select throws_ok($$insert into public.property_payment_accounts (org_id, property_id, kind, holder_name, phone, currency)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'yape', 'Estafador', '51999999999', 'USD')$$,
  '42501', null, 'staff cannot add an account');
select lives_ok($t$do $b$ declare n integer; begin
  update public.property_payment_accounts set phone = '51999999999' where id = 'a0270000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'staff changed % rows', n; end if;
end $b$$t$, 'staff cannot change where customers pay (0 rows)');
select lives_ok($t$do $b$ declare n integer; begin
  delete from public.property_payment_accounts where id = 'a0270000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'staff deleted % rows', n; end if;
end $b$$t$, 'staff cannot delete an account (0 rows)');
reset role;
select is((select phone from public.property_payment_accounts where id = 'a0270000-0000-4000-8000-000000000001'), '51900000001', 'the account is untouched');

-- ─── Owner of ANOTHER organization ──────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select lives_ok($t$do $b$ declare n integer; begin
  update public.property_payment_accounts set phone = '51999999999' where id = 'a0270000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'another org changed % rows', n; end if;
end $b$$t$, 'the owner of another organization cannot change it either');
reset role;

-- ─── The owner ──────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$insert into public.property_payment_accounts (org_id, property_id, kind, holder_name, phone, currency)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'plin', 'Titular Plin', '51900000002', 'USD')$$,
  'the owner can add an account');
select lives_ok($t$do $b$ declare n integer; begin
  update public.property_payment_accounts set holder_name = 'Titular Editado' where id = 'a0270000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'owner changed % rows', n; end if;
end $b$$t$, 'the owner can edit an account');
select lives_ok($t$do $b$ declare n integer; begin
  delete from public.property_payment_accounts where holder_name = 'Titular Plin';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'owner deleted % rows', n; end if;
end $b$$t$, 'the owner can delete an account');
reset role;
select is((select holder_name from public.property_payment_accounts where id = 'a0270000-0000-4000-8000-000000000001'), 'Titular Editado', 'the owner''s edit was applied');
select is((select count(*)::int from public.property_payment_accounts where holder_name = 'Titular Plin'), 0, 'and the account the owner added and deleted is gone');

select * from finish();
rollback;
