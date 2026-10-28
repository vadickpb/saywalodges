-- SD-806: recurring expenses. Ids from supabase/seed.sql:
--   orgs  Saywa bf88f504-..., Demo ff24bacc-...
--   users Saywa owner a3b45db1-..., Saywa staff c5d77e30-..., Demo owner bd6a1c86-...
--   unit  Saywa ee204001-...0001
begin;
select plan(34);

-- The owner creates a template for water, on day 10, around S/ 50.
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

create temp table t (id uuid);
grant all on t to authenticated;
with ins as (
  insert into public.finance_recurring (org_id, name, category_id, day_of_month, estimated_cents, currency, counterparty, payment_method, starts_month)
  select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'Agua SD806', c.id, 10, 5000, 'PEN', 'Sedapal', 'bank_transfer', '2025-03-01'
    from public.finance_categories c
   where c.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and c.system_key = 'water'
  returning id
)
insert into t select id from ins;

select is((select count(*)::int from public.finance_recurring where name = 'Agua SD806'), 1, 'The owner creates and sees a template');
select is((select starts_month::text from public.finance_recurring where id = (select id from t)), '2025-03-01', 'The first month is stored');

-- Confirm March with the real amount.
create temp table r1 (entry_id uuid, created boolean);
grant all on r1 to authenticated;
insert into r1 select * from public.confirm_recurring_expense(
  p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_recurring_id => (select id from t),
  p_month => '2025-03-01', p_amount_cents => 6120, p_currency => 'PEN');
select is((select created from r1), true, 'The first confirmation creates the expense');
select results_eq(
  $$select kind::text, amount_cents, occurred_on::text, counterparty, note, payment_method::text, unit_id is null
      from public.finance_entries where id = (select entry_id from r1)$$,
  $$values ('expense'::text, 6120, '2025-03-10'::text, 'Sedapal'::text, 'Agua SD806'::text, 'bank_transfer'::text, true)$$,
  'The expense carries the real amount, the template day, supplier and name');
select is((select created_by from public.finance_entries where id = (select entry_id from r1)),
  'a3b45db1-7c15-4528-a4ba-be625665fb6d'::uuid, 'created_by is the session user');

-- Confirming again returns the same expense and writes nothing.
create temp table r2 (entry_id uuid, created boolean);
grant all on r2 to authenticated;
insert into r2 select * from public.confirm_recurring_expense(
  p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_recurring_id => (select id from t),
  p_month => '2025-03-01', p_amount_cents => 9999, p_currency => 'PEN');
select is((select created from r2), false, 'The second confirmation is not a creation');
select is((select entry_id from r2), (select entry_id from r1), 'It returns the first expense');
select is((select count(*)::int from public.finance_entries where note = 'Agua SD806'), 1, 'No duplicate expense');
select is((select amount_cents from public.finance_entries where id = (select entry_id from r1)), 6120, 'The first amount is kept');
select is((select count(*)::int from public.finance_recurring_runs where recurring_id = (select id from t)), 1, 'One run per month');

-- A dollar template: the confirmation must use the template's currency.
update public.finance_recurring set currency = 'USD' where id = (select id from t);
select throws_ok(
  $$select * from public.confirm_recurring_expense('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from t), '2025-04-01', 1000, 'PEN')$$,
  '22023', 'currency differs from the template', 'The currency of the template cannot be changed on confirmation');

-- Another month is independent; a custom date inside the month is honoured; USD takes a rate.
create temp table r3 (entry_id uuid, created boolean);
grant all on r3 to authenticated;
insert into r3 select * from public.confirm_recurring_expense(
  p_org_id => 'bf88f504-051f-4fdc-ab73-4fa12d715817', p_recurring_id => (select id from t),
  p_month => '2025-04-01', p_amount_cents => 1000, p_currency => 'USD', p_fx_rate_pen => 3.75, p_occurred_on => '2025-04-20');
select results_eq(
  $$select occurred_on::text, currency::text, amount_pen_cents from public.finance_entries where id = (select entry_id from r3)$$,
  $$values ('2025-04-20'::text, 'USD'::text, 3750::bigint)$$,
  'April is a separate run with its own date, currency and PEN amount');
update public.finance_recurring set currency = 'PEN' where id = (select id from t);
select throws_ok(
  $$update public.finance_recurring set org_id = 'ff24bacc-47d2-40bc-9210-f860e98892fd' where id = (select id from t)$$,
  '42501', null, 'A template cannot be moved to another org');

-- Rejections.
select throws_ok(
  $$select * from public.confirm_recurring_expense('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from t), '2025-05-15', 100, 'PEN')$$,
  '22023', 'invalid month', 'A month must be the first day');
select throws_ok(
  $$select * from public.confirm_recurring_expense('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from t), '2025-02-01', 100, 'PEN')$$,
  '22023', 'month before the start of the template', 'A month before the template starts is refused');
select throws_ok(
  $$select * from public.confirm_recurring_expense('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from t), '2025-05-01', 100, 'PEN', null, '2025-06-01')$$,
  '22023', 'date outside the month', 'A date outside the month is refused');
select throws_ok(
  $$select * from public.confirm_recurring_expense('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from t), '2099-01-01', 100, 'PEN')$$,
  '22023', 'month has not begun', 'A month that has not begun is refused');
update public.finance_recurring set active = false where id = (select id from t);
select throws_ok(
  $$select * from public.confirm_recurring_expense('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from t), '2025-05-01', 100, 'PEN')$$,
  '22023', 'recurring expense is paused', 'A paused template cannot be confirmed');
update public.finance_recurring set active = true where id = (select id from t);
select is((select active from public.finance_recurring where id = (select id from t)), true, 'Resuming the template works again');
select throws_ok(
  $$select * from public.confirm_recurring_expense('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from t), '2025-05-01', 0, 'PEN')$$,
  '23514', null, 'The amount check of the ledger still applies');
select is((select count(*)::int from public.finance_recurring_runs where recurring_id = (select id from t) and month = '2025-05-01'), 0,
  'A refused confirmation leaves no run');
select throws_ok(
  $$select * from public.confirm_recurring_expense('ff24bacc-47d2-40bc-9210-f860e98892fd', (select id from t), '2025-05-01', 100, 'PEN')$$,
  '42501', 'recurring expense not found', 'The template must belong to the org of the session');

-- Deleting the confirmed expense makes the month pending again.
delete from public.finance_entries where id = (select entry_id from r1);
select is((select count(*)::int from public.finance_recurring_runs where recurring_id = (select id from t) and month = '2025-03-01'), 0,
  'Deleting the expense frees the month');

-- The category must be an expense category of the same org.
select throws_ok(
  $$insert into public.finance_recurring (org_id, name, category_id, day_of_month, estimated_cents, currency)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'bad', c.id, 1, 100, 'PEN' from public.finance_categories c
     where c.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and c.system_key = 'rental'$$,
  '23503', null, 'An income category is refused');
select throws_ok(
  $$insert into public.finance_recurring (org_id, name, category_id, day_of_month, estimated_cents, currency)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'bad', c.id, 29, 100, 'PEN' from public.finance_categories c
     where c.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and c.system_key = 'water'$$,
  '23514', null, 'Days past the 28th are refused');

-- ─── Saywa staff: sees and does nothing ─────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select is((select count(*)::int from public.finance_recurring), 0, 'Staff cannot see the templates');
select throws_ok(
  $$insert into public.finance_recurring_runs (recurring_id, org_id, month, entry_id)
    values (gen_random_uuid(), 'bf88f504-051f-4fdc-ab73-4fa12d715817', '2025-07-01', gen_random_uuid())$$,
  '42501', null, 'Staff cannot write confirmations');
select is((select count(*)::int from public.finance_recurring_runs), 0, 'Staff cannot see the runs');
select throws_ok(
  $$select * from public.confirm_recurring_expense('bf88f504-051f-4fdc-ab73-4fa12d715817', (select id from t), '2025-06-01', 100, 'PEN')$$,
  '42501', 'recurring expense not found', 'Staff cannot confirm');
select throws_ok(
  $$insert into public.finance_recurring (org_id, name, category_id, day_of_month, estimated_cents, currency)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'staff', c.id, 1, 100, 'PEN' from public.finance_categories c
     where c.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and c.system_key = 'water'$$,
  '42501', null, 'Staff cannot create a template');

-- ─── Other org: nothing crosses ─────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select is((select count(*)::int from public.finance_recurring), 0, 'The other org sees none of the templates');
select throws_ok(
  $$select * from public.confirm_recurring_expense('ff24bacc-47d2-40bc-9210-f860e98892fd', (select id from t), '2025-06-01', 100, 'PEN')$$,
  '42501', 'recurring expense not found', 'The other org cannot confirm a template of another org');

-- ─── anon ───────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select throws_ok($$select count(*) from public.finance_recurring$$, '42501', null, 'anon has no access to templates');
select throws_ok(
  $$select * from public.confirm_recurring_expense('bf88f504-051f-4fdc-ab73-4fa12d715817', gen_random_uuid(), '2025-06-01', 100, 'PEN')$$,
  '42501', null, 'anon cannot run the function');

select * from finish();
rollback;
