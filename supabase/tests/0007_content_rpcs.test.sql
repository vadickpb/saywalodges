-- SD-202 (part 2): reorder_* and set_hero_photo. Fixed ids from seed.sql:
-- Saywa property 131583b5-..., Demo property 57f914ac-...; owners a3b45db1-... (Saywa)
-- and bd6a1c86-... (Demo). Demo has space b2e1a0b1-... and a hero photo
-- d1a0c3e2-...4e01 plus gallery photos 4e02.. (all published).
begin;
select plan(18);

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

-- ─── reorder_spaces ─────────────────────────────────────────────────────────
select is(
  public.reorder_spaces('131583b5-785e-4127-81f0-e097163c5654',
    array['616122c6-9370-4065-9c8e-9a7b251a45de', '72e893c1-2512-4360-9244-361f1bd50c3f']::uuid[]),
  2, 'Member reorders their own spaces (2 rows changed)'
);
select is((select sort_order from public.spaces where id = '616122c6-9370-4065-9c8e-9a7b251a45de'), 0, 'First id gets position 0');
select is((select sort_order from public.spaces where id = '72e893c1-2512-4360-9244-361f1bd50c3f'), 1, 'Second id gets position 1');

select throws_ok(
  $$select public.reorder_spaces('57f914ac-3890-47c1-9d6d-1492782cf712',
      array['b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a']::uuid[])$$,
  'P0001', null, 'Member cannot reorder another org''s spaces (raises)'
);

-- Own ids mixed with a foreign id: the whole call fails and NOTHING moves.
select throws_ok(
  $$select public.reorder_spaces('131583b5-785e-4127-81f0-e097163c5654',
      array['72e893c1-2512-4360-9244-361f1bd50c3f', 'b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a']::uuid[])$$,
  'P0001', null, 'Mixed own + foreign ids raises'
);
select is((select sort_order from public.spaces where id = '72e893c1-2512-4360-9244-361f1bd50c3f'), 1,
  'A rejected reorder leaves the member''s own rows untouched (atomic)');

-- ─── amenities / distances ──────────────────────────────────────────────────
select is(
  public.reorder_amenities('131583b5-785e-4127-81f0-e097163c5654',
    (select array_agg(id order by sort_order desc) from public.amenities
      where property_id = '131583b5-785e-4127-81f0-e097163c5654')),
  (select count(*)::int from public.amenities where property_id = '131583b5-785e-4127-81f0-e097163c5654'),
  'Member reorders all their amenities'
);
select is(
  public.reorder_distances('131583b5-785e-4127-81f0-e097163c5654',
    (select array_agg(id order by sort_order desc) from public.distances
      where property_id = '131583b5-785e-4127-81f0-e097163c5654')),
  (select count(*)::int from public.distances where property_id = '131583b5-785e-4127-81f0-e097163c5654'),
  'Member reorders all their distances'
);
select throws_ok(
  $$select public.reorder_amenities('131583b5-785e-4127-81f0-e097163c5654',
      array['00000000-0000-0000-0000-000000000000']::uuid[])$$,
  'P0001', null, 'Unknown amenity id raises'
);

-- ─── reorder_photos / set_hero_photo ────────────────────────────────────────
select is(
  public.reorder_photos('131583b5-785e-4127-81f0-e097163c5654',
    array['9d60fcef-9d35-4011-80e0-8ea95e1102ee', '83505eca-dc0a-4fc1-b4b1-93896ead2530']::uuid[]),
  2, 'Member reorders the site-scope photos'
);
select throws_ok(
  $$select public.reorder_photos('131583b5-785e-4127-81f0-e097163c5654',
      array['f3840536-e702-4e33-bee1-fadbe6813fc8']::uuid[])$$,
  'P0001', null, 'A space photo is rejected when reordering the site scope'
);

select is(
  public.set_hero_photo('131583b5-785e-4127-81f0-e097163c5654', '9d60fcef-9d35-4011-80e0-8ea95e1102ee'),
  1, 'Member promotes a gallery photo to hero'
);
select is(
  (select count(*)::int from public.photos
    where property_id = '131583b5-785e-4127-81f0-e097163c5654' and space_id is null and role = 'hero'),
  1, 'Exactly one hero remains after set_hero_photo'
);

select is(
  (select role::text from public.photos where id = '83505eca-dc0a-4fc1-b4b1-93896ead2530'),
  'gallery', 'The previous hero was demoted to gallery'
);

-- A published photo of another org: 0 rows promoted, own hero not demoted.
select is(
  public.set_hero_photo('131583b5-785e-4127-81f0-e097163c5654', 'd1a0c3e2-5b6f-4c7d-8e9f-0a1b2c3d4e02'),
  0, 'set_hero_photo on another org''s photo changes nothing'
);
select is(
  (select id from public.photos
    where property_id = '131583b5-785e-4127-81f0-e097163c5654' and space_id is null and role = 'hero'),
  '9d60fcef-9d35-4011-80e0-8ea95e1102ee'::uuid, 'Own hero is not demoted by a foreign call'
);

-- ─── anon cannot call any of them ───────────────────────────────────────────
reset role;
set local role anon;
select throws_ok(
  $$select public.reorder_spaces('131583b5-785e-4127-81f0-e097163c5654', array[]::uuid[])$$,
  '42501', null, 'anon cannot call reorder_spaces'
);
select throws_ok(
  $$select public.set_hero_photo('131583b5-785e-4127-81f0-e097163c5654', '9d60fcef-9d35-4011-80e0-8ea95e1102ee')$$,
  '42501', null, 'anon cannot call set_hero_photo'
);

select * from finish();
rollback;
