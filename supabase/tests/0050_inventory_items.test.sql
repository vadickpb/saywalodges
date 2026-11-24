begin;
select no_plan();
-- Ids from supabase/seed.sql: Saywa org bf88f504-..., property 131583b5-..., pool space 72e893c1-...; owner a3b45db1-..., staff c5d77e30-...;
-- Demo org ff24bacc-..., owner bd6a1c86-...

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.inventory_items'::regclass, 'public.inventory_item_costs'::regclass)), 'both tables have RLS');
select ok(not has_table_privilege('anon', 'public.inventory_items', 'SELECT') and not has_table_privilege('anon', 'public.inventory_item_costs', 'SELECT'), 'anon reads nothing');
select ok(not has_column_privilege('authenticated', 'public.inventory_items', 'org_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.inventory_items', 'property_id', 'UPDATE'), 'tenant and property are immutable from the client');

-- Fixtures (as the table owner): a unit and its own space in Saywa.
insert into public.units (id, org_id, property_id, name, kind, max_guests, included_guests)
  values ('aaaa0001-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Villa I', 'entire_place', 13, 2),
         ('aaaa0001-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'Villa II', 'entire_place', 9, 2);
update public.spaces set unit_id = 'aaaa0001-0000-4000-8000-000000000001' where id = 'cd8f632d-6c96-4315-b0ed-2650c3b33a83';

-- Staff (a member) writes items but cannot touch costs.
select set_config('request.jwt.claims', '{"sub":"c5d77e30-4a6b-4e8c-9f21-7b3a1d2e6f40"}', true);
set local role authenticated;
select lives_ok($$insert into public.inventory_items (org_id, property_id, unit_id, name_es, name_en, quantity, category)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'aaaa0001-0000-4000-8000-000000000001', 'Platos', 'Plates', 12, 'kitchen')$$, 'staff adds an item to a unit');
select lives_ok($$insert into public.inventory_items (org_id, property_id, space_id, name_es, quantity, category, note)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'cd8f632d-6c96-4315-b0ed-2650c3b33a83', 'Almohadas', 4, 'bedding', 'nota interna')$$, 'staff adds an item to a space');
select lives_ok($$insert into public.inventory_items (org_id, property_id, space_id, name_es, quantity, category)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', '72e893c1-2512-4360-9244-361f1bd50c3f', 'Reposeras', 6, 'outdoor')$$, 'and to a common area (space with no unit)');
select lives_ok($$insert into public.inventory_items (org_id, property_id, unit_id, name_es, quantity, guest_visible)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'aaaa0001-0000-4000-8000-000000000002', 'Caja de herramientas', 1, false)$$, 'and a hidden item');
select throws_ok($$insert into public.inventory_items (org_id, property_id, unit_id, space_id, name_es)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'aaaa0001-0000-4000-8000-000000000001', 'cd8f632d-6c96-4315-b0ed-2650c3b33a83', 'x')$$, '23514', null, 'a unit and a space together are rejected');
select throws_ok($$insert into public.inventory_items (org_id, property_id, name_es, quantity) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'x', -1)$$, '23514', null, 'negative quantity rejected');
select throws_ok($$insert into public.inventory_items (org_id, property_id, name_es) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', '   ')$$, '23514', null, 'blank name rejected');
select throws_ok($$insert into public.inventory_items (org_id, property_id, name_es, category) values ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'x', 'weapons')$$, '23514', null, 'unknown category rejected');
select throws_ok($$insert into public.inventory_items (org_id, property_id, name_es) values ('ff24bacc-47d2-40bc-9210-f860e98892fd', '131583b5-785e-4127-81f0-e097163c5654', 'x')$$, null, null, 'a property of another organization is rejected');
select throws_ok($$update public.inventory_items set org_id = 'ff24bacc-47d2-40bc-9210-f860e98892fd' where id = (select id from public.inventory_items where name_es = 'Platos')$$, '42501', null, 'tenant cannot be moved');
select lives_ok($$update public.inventory_items set quantity = 10 where id = (select id from public.inventory_items where name_es = 'Platos')$$, 'staff updates the quantity');
select throws_ok($$insert into public.inventory_item_costs (item_id, org_id, replacement_cents, currency)
  values ((select id from public.inventory_items where name_es = 'Platos'), 'bf88f504-051f-4fdc-ab73-4fa12d715817', 500, 'PEN')$$, '42501', null, 'staff cannot set a cost');
select is((select count(*) from public.inventory_item_costs), 0::bigint, 'staff reads no costs');
reset role;

-- The owner sets and reads costs.
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select lives_ok($$insert into public.inventory_item_costs (item_id, org_id, replacement_cents, currency)
  values ((select id from public.inventory_items where name_es = 'Platos'), 'bf88f504-051f-4fdc-ab73-4fa12d715817', 500, 'PEN')$$, 'the owner sets a replacement cost');
select throws_ok($$insert into public.inventory_item_costs (item_id, org_id, replacement_cents, currency)
  values ((select id from public.inventory_items where name_es = 'Almohadas'), 'bf88f504-051f-4fdc-ab73-4fa12d715817', 500, 'EUR')$$, '23514', null, 'only PEN or USD');
select is((select count(*) from public.inventory_item_costs), 1::bigint, 'the owner reads it');
reset role;

-- Another organization's owner sees and changes nothing.
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select is((select count(*) from public.inventory_items) + (select count(*) from public.inventory_item_costs), 0::bigint, 'another organization sees none of it');
update public.inventory_items set quantity = 99;
delete from public.inventory_items;
reset role;
select is((select quantity from public.inventory_items where name_es = 'Platos'), 10, 'and cannot update or delete it');
select is((select count(*) from public.inventory_items), 4::bigint, 'nothing was deleted');

-- Guest read through a guide session.
insert into public.house_guide_links (org_id, label, token_hash, password_hash, expires_at)
  values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'Stay', repeat('c', 64), extensions.crypt('secreto-2026', extensions.gen_salt('bf')), now() + interval '7 days'),
         ('ff24bacc-47d2-40bc-9210-f860e98892fd', 'Other', repeat('d', 64), extensions.crypt('secreto-2026', extensions.gen_salt('bf')), now() + interval '7 days');
insert into private.house_guide_sessions (session_hash, org_id, link_id, expires_at)
  select repeat('e', 64), org_id, id, now() + interval '1 day' from public.house_guide_links where token_hash = repeat('c', 64);
insert into private.house_guide_sessions (session_hash, org_id, link_id, expires_at)
  select repeat('f', 64), org_id, id, now() + interval '1 day' from public.house_guide_links where token_hash = repeat('d', 64);

select ok(has_function_privilege('anon', 'public.read_house_inventory(text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_house_inventory(text,text,text)', 'EXECUTE'), 'only anon can call the guest read');
set local role anon;
select is(jsonb_array_length(public.read_house_inventory('saywa-lodges', repeat('c', 64), repeat('e', 64))), 3, 'guest sees the 3 visible items (hidden one is left out)');
select is((select string_agg(distinct k, ',' order by k) from jsonb_array_elements(public.read_house_inventory('saywa-lodges', repeat('c', 64), repeat('e', 64))) e, jsonb_object_keys(e) k),
  'category,id,name_en,name_es,quantity,space_en,space_es,unit', 'only guest fields: no note, cost, org or property ids');
select is(public.read_house_inventory('saywa-lodges', repeat('c', 64), repeat('0', 64)), '[]'::jsonb, 'wrong session returns nothing');
select is(public.read_house_inventory('saywa-lodges', repeat('d', 64), repeat('f', 64)), '[]'::jsonb, 'another organization''s link does not open this one');
select is(public.read_house_inventory('demo', repeat('c', 64), repeat('e', 64)), '[]'::jsonb, 'nor on another host');
reset role;
update public.house_guide_links set revoked_at = now() where token_hash = repeat('c', 64);
set local role anon;
select is(public.read_house_inventory('saywa-lodges', repeat('c', 64), repeat('e', 64)), '[]'::jsonb, 'a revoked link returns nothing');
reset role;

-- Deleting a space keeps its items; deleting a unit removes them.
delete from public.spaces where id = 'cd8f632d-6c96-4315-b0ed-2650c3b33a83';
select is((select space_id from public.inventory_items where name_es = 'Almohadas'), null, 'item survives its space and becomes property-wide');
delete from public.units where id = 'aaaa0001-0000-4000-8000-000000000001';
select is((select count(*) from public.inventory_items where name_es = 'Platos'), 0::bigint, 'deleting a unit deletes its items');
select is((select count(*) from public.inventory_item_costs), 0::bigint, 'and their costs');

select * from finish();
rollback;
