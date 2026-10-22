-- SD-202 (part 2): reorder_* and set_hero_photo. Fixed ids from seed.sql:
-- Saywa property 131583b5-..., Demo property 57f914ac-...; owners a3b45db1-... (Saywa)
-- and bd6a1c86-... (Demo).
begin;
select plan(8);

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

-- ─── reorder_spaces ─────────────────────────────────────────────────────────
select is(
  public.reorder_spaces(
    '131583b5-785e-4127-81f0-e097163c5654',
    array['616122c6-9370-4065-9c8e-9a7b251a45de', '72e893c1-2512-4360-9244-361f1bd50c3f']::uuid[]
  ),
  2,
  'Member reorders their own spaces (2 rows changed)'
);
select is(
  (select sort_order from public.spaces where id = '616122c6-9370-4065-9c8e-9a7b251a45de'),
  0,
  'First id in the array gets position 0'
);
select is(
  (select sort_order from public.spaces where id = '72e893c1-2512-4360-9244-361f1bd50c3f'),
  1,
  'Second id gets position 1'
);

-- Another org's space id mixed in is silently ignored by RLS (0 rows), so the
-- DAL's count check catches it.
select is(
  public.reorder_spaces(
    '57f914ac-3890-47c1-9d6d-1492782cf712',
    array['b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a']::uuid[]
  ),
  0,
  'Member cannot reorder another org''s spaces (0 rows changed)'
);

-- ─── reorder_photos / set_hero_photo ────────────────────────────────────────
select is(
  public.reorder_photos('131583b5-785e-4127-81f0-e097163c5654',
    array['9d60fcef-9d35-4011-80e0-8ea95e1102ee', '83505eca-dc0a-4fc1-b4b1-93896ead2530']::uuid[]),
  2,
  'Member reorders the site-scope photos'
);
select is(
  public.reorder_photos('131583b5-785e-4127-81f0-e097163c5654',
    array['f3840536-e702-4e33-bee1-fadbe6813fc8']::uuid[]),
  0,
  'A space photo is ignored when reordering the site scope'
);

select is(
  public.set_hero_photo('131583b5-785e-4127-81f0-e097163c5654', '9d60fcef-9d35-4011-80e0-8ea95e1102ee'),
  1,
  'Member promotes a gallery photo to hero'
);
select is(
  (select count(*)::int from public.photos
    where property_id = '131583b5-785e-4127-81f0-e097163c5654' and space_id is null and role = 'hero'),
  1,
  'Exactly one hero remains after set_hero_photo'
);

select * from finish();
rollback;
