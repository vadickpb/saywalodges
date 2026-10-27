-- SD-801: finance ledger. Ids from supabase/seed.sql:
--   orgs  Saywa bf88f504-..., Demo ff24bacc-...
--   users Saywa owner a3b45db1-..., Saywa staff c5d77e30-..., Demo owner bd6a1c86-...
--   units Saywa ee204001-...0001, Demo ee204001-...0002
begin;
select plan(81);

select set_config('storage.allow_delete_query', 'true', true);

-- Category ids by key, readable by every role under test.
create temp table cat as select org_id, system_key, id from public.finance_categories;
grant select on cat to anon, authenticated;

-- ─── Structure and seed ─────────────────────────────────────────────────────
select has_table('public', 'finance_categories', 'finance_categories exists');
select has_table('public', 'finance_entries', 'finance_entries exists');
select ok((select relrowsecurity from pg_class where oid = 'public.finance_categories'::regclass), 'Categories have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.finance_entries'::regclass), 'Entries have RLS');
select is((select count(*)::int from public.finance_categories where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 15,
  'Saywa has the 15 built-in categories');
select is((select count(*)::int from public.finance_categories where org_id = 'ff24bacc-47d2-40bc-9210-f860e98892fd'), 15,
  'Demo has the 15 built-in categories');
select is((select count(*)::int from public.finance_categories where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and kind = 'income'), 3,
  'Three income categories');

-- Seeding: new orgs get the built-ins by trigger; re-seeding is idempotent; a user
-- category named like a built-in is adopted instead of blocking it.
insert into public.organizations (id, name) values ('99999999-0000-4000-8000-000000000001', 'Seed Test Org');
select is((select count(*)::int from public.finance_categories where org_id = '99999999-0000-4000-8000-000000000001'), 15,
  'A new org is seeded with the built-in categories by trigger');
select lives_ok($$select private.seed_finance_categories('99999999-0000-4000-8000-000000000001')$$, 'Re-seeding is allowed');
select is((select count(*)::int from public.finance_categories where org_id = '99999999-0000-4000-8000-000000000001'), 15, 'Re-seeding is idempotent');
delete from public.finance_categories where org_id = '99999999-0000-4000-8000-000000000001' and system_key = 'water';
insert into public.finance_categories (org_id, kind, name) values ('99999999-0000-4000-8000-000000000001', 'expense', ' agua ');
select private.seed_finance_categories('99999999-0000-4000-8000-000000000001');
select is((select system_key from public.finance_categories where org_id = '99999999-0000-4000-8000-000000000001' and lower(btrim(name)) = 'agua'), 'water',
  'A same-named user category is adopted as the built-in');
select is((select count(*)::int from public.finance_categories where org_id = '99999999-0000-4000-8000-000000000001'), 15, 'Adoption does not duplicate the category');

-- Trusted-loader constraints (checked as table owner, before any role switch).
insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, source, external_ref)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-01-10', 1000, 'PEN', 'ical', 'evt-1'
from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental';
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, source, external_ref)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-01-11', 1000, 'PEN', 'ical', 'evt-1'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental'$$,
  '23505', null, 'The same (org, source, external_ref) cannot be loaded twice');
select lives_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, source, external_ref)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-01-11', 1000, 'PEN', 'booking', 'evt-1'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental'$$,
  'The same reference under another source is a different key');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, external_ref)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-01-12', 1000, 'PEN', 'x'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental'$$,
  '23514', null, 'A manual entry cannot carry an external_ref');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, source)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-01-12', 1000, 'PEN', 'ical'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental'$$,
  '23514', null, 'An imported entry must carry its external_ref');

-- ─── Saywa owner ────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select results_eq(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, unit_id,
      stay_start, stay_end, channel, guests, payment_method, counterparty)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-03', 80000, 'PEN',
      'ee204001-0000-4000-8000-000000000001', '2027-02-01', '2027-02-04', 'airbnb', 4, 'platform', 'Guest A'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental'
    returning amount_pen_cents$$,
  $$values (80000::bigint)$$, 'Owner records a rental; PEN amounts convert 1:1');

select results_eq(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 100, 'USD', 3.755
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'extra_services'
    returning amount_pen_cents$$,
  $$values (376::bigint)$$, 'USD converts with exact half-up rounding (100 x 3.755 = 375.5 -> 376)');

select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 100, 'USD'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'extra_services'$$,
  '23514', null, 'USD without an exchange rate is rejected');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 100, 'PEN', 1
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'extra_services'$$,
  '23514', null, 'PEN with an exchange rate is rejected');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 100, 'USD', 0
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'extra_services'$$,
  '23514', null, 'A zero exchange rate is rejected');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 0, 'PEN'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'extra_services'$$,
  '23514', null, 'A zero amount is rejected');

select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-02-05', 500, 'PEN'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental'$$,
  '23503', null, 'An expense cannot use an income category (kind is pinned by the FK)');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 500, 'PEN'
    from cat where org_id = 'ff24bacc-47d2-40bc-9210-f860e98892fd' and system_key = 'rental'$$,
  '23503', null, 'A category from another org is rejected');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, unit_id)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-02-05', 500, 'PEN',
      'ee204001-0000-4000-8000-000000000002'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23503', null, 'A unit from another org is rejected (composite FK)');

select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, stay_start, stay_end)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 500, 'PEN', '2027-02-05', '2027-02-05'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental'$$,
  '23514', null, 'A stay must end after it starts');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, stay_start, stay_end)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-02-05', 500, 'PEN', '2027-02-05', '2027-02-06'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23514', null, 'Only income can carry a stay');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, channel)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-02-05', 500, 'PEN', 'airbnb'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23514', null, 'Only income can carry a channel');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, guests)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 500, 'PEN', 2
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental'$$,
  '23514', null, 'Guests need a stay');

select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-02-05', 500, 'PEN',
      'ff24bacc-47d2-40bc-9210-f860e98892fd/receipts/x.jpg'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23514', null, 'A receipt path under another org prefix is rejected');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-02-05', 500, 'PEN',
      'bf88f504-051f-4fdc-ab73-4fa12d715817/../ff24bacc-47d2-40bc-9210-f860e98892fd/x.jpg'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '23514', null, 'A receipt path with .. is rejected');

select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, source, external_ref)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 500, 'PEN', 'ical', 'forged'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental'$$,
  '42501', null, 'Users cannot set source / external_ref');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, created_by)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-02-05', 500, 'PEN',
      'c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '42501', null, 'Users cannot set created_by');

-- A cleaning cost linked to the rental; deleting the rental keeps the cost.
select lives_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, unit_id, related_entry_id)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', c.id, '2027-02-04', 8000, 'PEN',
      'ee204001-0000-4000-8000-000000000001',
      (select id from public.finance_entries where counterparty = 'Guest A')
    from cat c where c.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and c.system_key = 'cleaning'$$,
  'Owner links a cleaning cost to the rental');
select throws_ok(
  $$delete from public.units where id = 'ee204001-0000-4000-8000-000000000001'$$,
  '23503', null, 'A unit with financial history cannot be deleted');
delete from public.finance_entries where counterparty = 'Guest A';
select results_eq(
  $$select related_entry_id is null from public.finance_entries where amount_cents = 8000$$,
  $$values (true)$$, 'Deleting the rental keeps its cost, unlinked');

-- Suggested cleaning cost lives in its own owner-managed table, never in public.units
-- (anon can read units).
select hasnt_column('public', 'units', 'cleaning_cost_cents', 'The public units table carries no internal cost');
select lives_ok(
  $$insert into public.finance_unit_settings (unit_id, org_id, cleaning_cost_cents)
    values ('ee204001-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 8000)$$,
  'Owner sets a suggested cleaning cost');
select throws_ok(
  $$update public.finance_unit_settings set cleaning_cost_cents = -1$$,
  '23514', null, 'A negative cleaning cost is rejected');
select throws_ok(
  $$insert into public.finance_unit_settings (unit_id, org_id, cleaning_cost_cents)
    values ('ee204001-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 1)$$,
  '23503', null, 'A unit from another org cannot get settings (composite FK)');

-- Categories: only the owner shapes them; names are unique per kind.
select lives_ok($$insert into public.finance_categories (org_id, kind, name) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', 'Jardinería')$$,
  'Owner adds a category');
select throws_ok($$insert into public.finance_categories (org_id, kind, name) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', ' jardinería ')$$,
  '23505', null, 'Category names are unique per org and kind, ignoring case and spaces');
select results_eq($$update public.finance_categories set name = 'Jardinería y poda' where name = 'Jardinería' returning name$$,
  $$values ('Jardinería y poda'::text)$$, 'Owner renames a category');
select results_eq($$delete from public.finance_categories where name = 'Jardinería y poda' returning name$$,
  $$values ('Jardinería y poda'::text)$$, 'Owner deletes a custom category');
select results_eq($$delete from public.finance_categories where system_key = 'water' returning id$$,
  $$select id from public.finance_categories where false$$, 'Built-in categories cannot be deleted');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-02-05', 100, 'USD', 100
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'extra_services'$$,
  '23514', null, 'An exchange rate of 100 or more is rejected');
select lives_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, receipt_path)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-02-05', 777, 'PEN', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/ok.jpg'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  'A receipt path under the own org prefix is accepted');

-- Owner entry with a fixed id, used by the staff checks below (inserted as table owner).
reset role;
insert into public.finance_entries (id, org_id, kind, category_id, occurred_on, amount_cents, currency, counterparty, created_by)
select 'a0000000-0000-4000-8000-0000000000a1', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'income', id, '2027-03-01', 50000, 'PEN',
  'Owner only', 'a3b45db1-7c15-4528-a4ba-be625665fb6d'
from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'rental';

-- ─── Saywa staff ────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;

select ok((select count(*) from public.finance_categories where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817') >= 15,
  'Staff can read the categories to register entries');
select throws_ok($$insert into public.finance_categories (org_id, kind, name) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', 'Staff cat')$$,
  '42501', null, 'Staff cannot create categories');
select results_eq($$update public.finance_categories set name = 'Hacked' where system_key = 'water' returning id$$,
  $$select id from public.finance_categories where false$$, 'Staff category update affects zero rows');

select results_eq(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, counterparty)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-03-02', 3000, 'PEN', 'Staff cleaning'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'cleaning'
    returning created_by$$,
  $$values ('c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40'::uuid)$$, 'Staff registers an expense; created_by is the session user');
select is((select count(*)::int from public.finance_entries), 1, 'Staff only sees the entries they created');
select is((select count(*)::int from public.finance_entries where counterparty = 'Owner only'), 0, 'Staff cannot see the owner''s entries');
select results_eq($$update public.finance_entries set amount_cents = 1 where counterparty = 'Owner only' returning id$$,
  $$select id from public.finance_entries where false$$, 'Staff cannot edit the owner''s entries');
select results_eq($$delete from public.finance_entries where counterparty = 'Owner only' returning id$$,
  $$select id from public.finance_entries where false$$, 'Staff cannot delete the owner''s entries');
select results_eq($$update public.finance_entries set amount_cents = 3500 where counterparty = 'Staff cleaning' returning amount_cents$$,
  $$values (3500)$$, 'Staff edits their own entry');
select lives_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, related_entry_id)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', c.id, '2027-03-02', 100, 'PEN',
      (select id from public.finance_entries where counterparty = 'Staff cleaning')
    from cat c where c.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and c.system_key = 'supplies'$$,
  'Staff can link a cost to an entry they created');
select throws_ok($$update public.finance_entries set org_id = 'ff24bacc-47d2-40bc-9210-f860e98892fd' where counterparty = 'Staff cleaning'$$,
  '42501', null, 'Staff cannot move an entry to another org');
select throws_ok($$update public.finance_entries set kind = 'income' where counterparty = 'Staff cleaning'$$,
  '42501', null, 'Staff cannot change an entry''s kind');
select throws_ok($$update public.finance_entries set related_entry_id = 'a0000000-0000-4000-8000-0000000000a1' where counterparty = 'Staff cleaning'$$,
  '42501', null, 'Staff cannot re-link an existing entry to one they cannot see');
-- The owner links the staff entry to an owner rental (simulated as table owner);
-- the staff member can still edit their own entry afterwards.
reset role;
update public.finance_entries set related_entry_id = 'a0000000-0000-4000-8000-0000000000a1' where counterparty = 'Staff cleaning';
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select results_eq($$update public.finance_entries set note = 'edited' where counterparty = 'Staff cleaning' returning note$$,
  $$values ('edited'::text)$$, 'Staff can still edit an entry the owner linked to something they cannot see');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, related_entry_id)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', c.id, '2027-03-02', 100, 'PEN',
      'a0000000-0000-4000-8000-0000000000a1'
    from cat c where c.org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and c.system_key = 'cleaning'$$,
  '42501', null, 'Staff cannot link a cost to an entry they cannot see');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, created_by)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-03-02', 100, 'PEN', 'a3b45db1-7c15-4528-a4ba-be625665fb6d'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'cleaning'$$,
  '42501', null, 'Staff cannot impersonate the owner as author');

-- ─── Another organization (Demo owner) ──────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;

select is((select count(*)::int from public.finance_entries where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 0,
  'Another org sees none of Saywa''s entries');
select is((select count(*)::int from public.finance_categories where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'), 0,
  'Another org sees none of Saywa''s categories');
select throws_ok(
  $$insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency)
    select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'expense', id, '2027-03-02', 100, 'PEN'
    from cat where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' and system_key = 'water'$$,
  '42501', null, 'Another org cannot write into Saywa''s ledger');
select results_eq($$delete from public.finance_entries where org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817' returning id$$,
  $$select id from public.finance_entries where false$$, 'Another org cannot delete Saywa''s entries');

-- ─── anon ───────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select throws_ok($$select count(*) from public.finance_entries$$, '42501', null, 'anon cannot read entries');
select throws_ok($$select count(*) from public.finance_categories$$, '42501', null, 'anon cannot read categories');

-- ─── Private receipts bucket ────────────────────────────────────────────────
reset role;
select is((select public from storage.buckets where id = 'finance-receipts'), false, 'finance-receipts is private');
select is((select file_size_limit from storage.buckets where id = 'finance-receipts'), 5242880::bigint, 'Receipts are limited to 5 MB');
select is((select allowed_mime_types from storage.buckets where id = 'finance-receipts'),
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], 'Receipts accept images and PDF only');

-- An owner-uploaded object, written as table owner.
insert into storage.objects (bucket_id, name, owner_id)
values ('finance-receipts', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/owner.pdf', 'a3b45db1-7c15-4528-a4ba-be625665fb6d');

select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('finance-receipts', 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/staff.jpg', 'c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40')$$,
  'Staff uploads a receipt under their org prefix');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values ('finance-receipts', 'ff24bacc-47d2-40bc-9210-f860e98892fd/receipts/x.jpg', 'c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40')$$,
  '42501', null, 'Staff cannot upload under another org prefix');
select results_eq($$update storage.objects set name = 'bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/moved.jpg' where bucket_id = 'finance-receipts' and name like '%staff.jpg' returning name$$,
  $$select name from storage.objects where false$$, 'Staff cannot rename or replace receipts (update is owner-only)');
select results_eq($$delete from storage.objects where bucket_id = 'finance-receipts' and name like '%owner.pdf' returning name$$,
  $$select name from storage.objects where false$$, 'Staff cannot delete the owner''s receipts');
select results_eq($$select name from storage.objects where bucket_id = 'finance-receipts' order by name$$,
  $$values ('bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/staff.jpg'::text)$$,
  'Staff only reads the receipts they uploaded');

reset role;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'finance-receipts'), 2, 'The owner reads every receipt of the org');
select results_eq($$delete from storage.objects where bucket_id = 'finance-receipts' and name like '%staff.jpg' returning name$$,
  $$values ('bf88f504-051f-4fdc-ab73-4fa12d715817/receipts/staff.jpg'::text)$$, 'The owner can delete any receipt of the org');

reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'finance-receipts'), 0, 'Another org reads no receipts');

reset role;
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'finance-receipts'), 0, 'anon reads no receipts');

select * from finish();
rollback;
