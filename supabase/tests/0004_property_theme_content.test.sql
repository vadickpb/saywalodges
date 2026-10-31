-- SD-209 (part 1): properties.theme / properties.content.
-- Saywa property 131583b5-785e-4127-81f0-e097163c5654 · owner a3b45db1-7c15-4528-a4ba-be625665fb6d
begin;
select plan(7);

select has_column('public', 'properties', 'theme', 'properties.theme exists');
select has_column('public', 'properties', 'content', 'properties.content exists');

-- Shape is zod's job; the DB only guarantees "a JSON object", so the parser
-- never sees a string/array/null.
select throws_like(
  $$update public.properties set theme = '"red"'::jsonb where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '%properties_theme_is_object%',
  'theme rejects a non-object (string)'
);
select throws_like(
  $$update public.properties set content = '[]'::jsonb where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '%properties_content_is_object%',
  'content rejects a non-object (array)'
);

-- SD-210 widened the column grant: a member of the owning org can write
-- theme/content (cross-org and anon denial live in
-- 0021_site_appearance_isolation.test.sql), but the shape check still holds.
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select throws_like(
  $$update public.properties set theme = '[]'::jsonb where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '%properties_theme_is_object%',
  'owner writing theme still hits the object check constraint'
);
select lives_ok(
  $$update public.properties set content = '{}'::jsonb where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  'owner can write content through the SD-210 column grant'
);

-- Reading is public for published properties, like every other column.
reset role;
set local role anon;
select ok(
  (select theme ? 'preset' from public.properties where id = '131583b5-785e-4127-81f0-e097163c5654'),
  'anon can read the published property''s theme'
);

select * from finish();
rollback;
