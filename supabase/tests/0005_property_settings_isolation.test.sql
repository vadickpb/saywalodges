-- SD-201 security review: two gaps 0003_org_isolation.test.sql didn't
-- actually cover, both about the table lib/dal/property.ts writes to.
-- Fixed ids from supabase/seed.sql, same as 0003.
begin;
select plan(3);

-- ─── properties_org_id_key (new in this migration) ─────────────────────────
select throws_like(
  $$insert into public.properties (slug, name, whatsapp_number, subdomain, org_id)
    values ('second-property', 'x', '1', 'second-property', 'bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '%properties_org_id_key%',
  'An org cannot have a second property (unique(org_id)) — lib/dal/property.ts#updatePropertySettings writes by org_id alone, so this must hold for that write to stay scoped to exactly one row'
);

-- ─── Non-member UPDATE on properties (0003 only tested this for rooms) ─────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

update public.properties set name = 'HACKED' where id = '57f914ac-3890-47c1-9d6d-1492782cf712';
select is(
  (select name from public.properties where id = '57f914ac-3890-47c1-9d6d-1492782cf712'),
  'Demo Lodge',
  'Non-member UPDATE on another org''s property affects 0 rows (exercises the actual column grant + properties_update RLS the dashboard''s settings form relies on)'
);

-- Sanity: the member themself can still update their own property's name
-- through the same grant/policy pair, so the test above is proving
-- isolation, not that writes are broken entirely.
select results_eq(
  $$update public.properties set name = 'Saywa Lodges X' where id = '131583b5-785e-4127-81f0-e097163c5654' returning name$$,
  $$values ('Saywa Lodges X'::text)$$,
  'Member can update their own property''s name (same column grant, own org) — exactly 1 row changed'
);

select * from finish();
rollback;
