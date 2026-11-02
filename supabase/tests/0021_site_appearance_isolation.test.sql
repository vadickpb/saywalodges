-- SD-210: the column grant on properties.theme / properties.content that the
-- "Sitio → Apariencia" editor relies on. Fixed ids from supabase/seed.sql:
-- Saywa property 131583b5-… owned by a3b45db1-…; Demo property 57f914ac-…
-- belongs to another org that a3b45db1 is not a member of.
begin;
select plan(9);

-- ─── Cross-org: a member of Saywa cannot change Demo's theme/content ──────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

update public.properties set theme = '{"preset":"noche"}'::jsonb where id = '57f914ac-3890-47c1-9d6d-1492782cf712';
update public.properties set content = '{"capacity":99}'::jsonb where id = '57f914ac-3890-47c1-9d6d-1492782cf712';
select is(
  (select theme->>'preset' from public.properties where id = '57f914ac-3890-47c1-9d6d-1492782cf712'),
  'costa',
  'Cross-org UPDATE of theme affects 0 rows (properties_update RLS on top of the new column grant)'
);
select is(
  (select content->>'capacity' from public.properties where id = '57f914ac-3890-47c1-9d6d-1492782cf712'),
  '4',
  'Cross-org UPDATE of content affects 0 rows'
);

select results_eq(
  $$update public.properties set theme = '{"preset":"selva"}'::jsonb where id = '57f914ac-3890-47c1-9d6d-1492782cf712' returning id$$,
  $$select null::uuid where false$$,
  'Cross-org UPDATE ... RETURNING yields no rows (the DAL treats 0 updated rows as a failed save)'
);

-- Moving a row to another org is still impossible: org_id is not granted.
select throws_like(
  $$update public.properties set org_id = 'ff24bacc-47d2-40bc-9210-f860e98892fd' where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '%permission denied%',
  'org_id stays outside the column grant'
);

-- ─── Same-org member: theme and content are writable ──────────────────────
select results_eq(
  $$update public.properties
    set theme = '{"preset":"selva","primary":"#112233"}'::jsonb, content = '{"capacity":7}'::jsonb
    where id = '131583b5-785e-4127-81f0-e097163c5654'
    returning theme->>'primary', (content->>'capacity')::int$$,
  $$values ('#112233'::text, 7)$$,
  'Member of the owning org can update theme and content (exactly 1 row)'
);

-- Shape check from SD-209 still applies to what the editor writes.
select throws_like(
  $$update public.properties set content = '"x"'::jsonb where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '%properties_content_is_object%',
  'content must remain a JSON object'
);

-- The grant did not widen anything else: slug / subdomain stay off-limits.
select throws_like(
  $$update public.properties set subdomain = 'hijack' where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '%permission denied%',
  'subdomain is still not writable by authenticated'
);

-- ─── anon never writes ────────────────────────────────────────────────────
reset role;
set local role anon;

select throws_like(
  $$update public.properties set theme = '{"preset":"noche"}'::jsonb where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '%permission denied%',
  'anon cannot write theme'
);
select throws_like(
  $$update public.properties set content = '{}'::jsonb where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '%permission denied%',
  'anon cannot write content'
);

select * from finish();
rollback;
