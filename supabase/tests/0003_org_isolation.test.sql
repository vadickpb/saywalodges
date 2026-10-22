-- SD-102: real multi-tenant isolation via RLS. Fixed ids from supabase/seed.sql:
--   Saywa org  bf88f504-051f-4fdc-ab73-4fa12d715817 · owner a3b45db1-7c15-4528-a4ba-be625665fb6d
--     property 131583b5-785e-4127-81f0-e097163c5654 (published)
--   Demo org   ff24bacc-47d2-40bc-9210-f860e98892fd · owner bd6a1c86-01e2-40a4-ba79-4e28b373e880
--     property 57f914ac-3890-47c1-9d6d-1492782cf712 (published), room b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a
--
-- Important distinction this file exists to pin down: "isolation" means a
-- non-member can never WRITE another org's rows, and can never READ another
-- org's UNPUBLISHED rows. It does NOT mean published content is hidden from
-- non-members — that's the opposite of what "published" is for. An earlier,
-- wrong assumption while implementing this ticket treated "can read another
-- org's published room" as a failure; it isn't.
begin;
select plan(25);

select hasnt_function(
  'public', 'is_member', array['uuid'],
  'is_member must not exist in public (moved to private, not exposed via PostgREST RPC)'
);

-- ─── subdomain/custom_domain CHECK constraints (independent of role/RLS) ───
-- Run before switching role below, so these hit the constraint itself, not
-- a GRANT/RLS denial that would mask whether the CHECK actually works.
select throws_like(
  $$insert into public.properties (slug, name, whatsapp_number, subdomain, org_id)
    values ('bad-subdomain-case', 'x', '1', 'Uppercase', 'bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '%properties_subdomain_format%',
  'subdomain must be lowercase'
);
select throws_like(
  $$insert into public.properties (slug, name, whatsapp_number, subdomain, org_id)
    values ('bad-subdomain-reserved', 'x', '1', 'app', 'bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '%properties_subdomain_format%',
  'subdomain cannot be a reserved infra name'
);
select throws_like(
  $$insert into public.properties (slug, name, whatsapp_number, subdomain, org_id, custom_domain)
    values ('bad-custom-domain', 'x', '1', 'bad-custom-domain', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'notadomain')$$,
  '%properties_custom_domain_format%',
  'custom_domain must look like an actual domain (needs at least one dot)'
);

-- Found by security-reviewer: maps_url/airbnb_url render as <a href>/
-- <iframe src> on the public site, with no app-level validation standing
-- between a direct PostgREST write and those columns. A javascript: value
-- here would be a stored XSS against that tenant's own visitors.
select throws_like(
  $$insert into public.properties (slug, name, whatsapp_number, subdomain, org_id, maps_url)
    values ('bad-maps-url', 'x', '1', 'bad-maps-url', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'javascript:alert(1)')$$,
  '%properties_maps_url_format%',
  'maps_url cannot be a javascript: URL (must be https:// or empty)'
);

-- ─── As Saywa's owner (not a member of Demo) ────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select ok(
  exists(select 1 from public.spaces where id = 'b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a'),
  'Non-member CAN see another org''s space while its property is published (intended: public content)'
);

update public.spaces set label_en = 'HACKED' where id = 'b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a';
select is(
  (select label_en from public.spaces where id = 'b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a'),
  'Demo Room',
  'Non-member UPDATE on another org''s space affects 0 rows'
);

delete from public.spaces where id = 'b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a';
select ok(
  exists(select 1 from public.spaces where id = 'b2e1a0b1-7a7e-4f2a-8c9a-0b1c2d3e4f5a'),
  'Non-member DELETE on another org''s space affects 0 rows (room still exists)'
);

-- The actual SD-101 pattern: own org_id (passes RLS's with check) paired
-- with ANOTHER org's property_id. RLS alone wouldn't catch this — it's the
-- composite (property_id, org_id) FK that has to reject it.
select throws_like(
  $$insert into public.spaces (key, category, property_id, org_id, label_en, label_es)
    values ('sneaky', 'rooms', '57f914ac-3890-47c1-9d6d-1492782cf712',
            'bf88f504-051f-4fdc-ab73-4fa12d715817', 'x', 'x')$$,
  '%foreign key constraint%',
  'Cannot insert own org_id paired with another org''s property_id (composite FK)'
);

-- Same pattern via UPDATE: move one of Saywa's own spaces onto Demo's
-- property while keeping org_id = Saywa. Must fail the same way.
select throws_like(
  $$update public.spaces set property_id = '57f914ac-3890-47c1-9d6d-1492782cf712'
    where property_id = '131583b5-785e-4127-81f0-e097163c5654' and org_id = 'bf88f504-051f-4fdc-ab73-4fa12d715817'$$,
  '%foreign key constraint%',
  'Cannot move an own-org room onto another org''s property (composite FK)'
);

-- Found by reviewer: the same composite (property_id, org_id) FK exists on
-- rate_tiers/amenities/distances (identical pattern to spaces/photos above),
-- but only spaces/photos had a test exercising it. One INSERT-direction
-- assertion per remaining table, same shape as the spaces case.
select throws_like(
  $$insert into public.rate_tiers (season_en, season_es, from_en, from_es, property_id, org_id)
    values ('x', 'x', 'x', 'x', '57f914ac-3890-47c1-9d6d-1492782cf712', 'bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '%foreign key constraint%',
  'rate_tiers: cannot insert own org_id paired with another org''s property_id'
);
select throws_like(
  $$insert into public.amenities (title_en, title_es, property_id, org_id)
    values ('x', 'x', '57f914ac-3890-47c1-9d6d-1492782cf712', 'bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '%foreign key constraint%',
  'amenities: cannot insert own org_id paired with another org''s property_id'
);
select throws_like(
  $$insert into public.distances (place_en, place_es, time_en, time_es, property_id, org_id)
    values ('x', 'x', 'x', 'x', '57f914ac-3890-47c1-9d6d-1492782cf712', 'bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '%foreign key constraint%',
  'distances: cannot insert own org_id paired with another org''s property_id'
);

-- photos.space_id: a photo with Saywa's own org_id/property_id but pointing
-- space_id at a space that belongs to Demo's property.
select throws_like(
  $$insert into public.photos (property_id, org_id, space_id, storage_path, role, sort_order)
    values ('131583b5-785e-4127-81f0-e097163c5654', 'bf88f504-051f-4fdc-ab73-4fa12d715817',
            (select id from public.spaces where key = 'demo-room' limit 1), 'x.jpg', 'room', 0)$$,
  '%foreign key constraint%',
  'Cannot insert a photo whose space_id belongs to a different org''s property'
);

-- Same pattern via UPDATE: take one of Saywa's own hero/gallery photos
-- (space_id null) and try to point it at Demo's space.
select throws_like(
  $$update public.photos set space_id = (select id from public.spaces where key = 'demo-room' limit 1)
    where id = (select id from public.photos
                where property_id = '131583b5-785e-4127-81f0-e097163c5654' and space_id is null limit 1)$$,
  '%foreign key constraint%',
  'Cannot update a photo''s space_id to point at a different org''s room'
);

-- Toggle Demo's property to unpublished (rolled back with the transaction).
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
update public.properties set published = false where id = '57f914ac-3890-47c1-9d6d-1492782cf712';

select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
select ok(
  not exists(select 1 from public.properties where id = '57f914ac-3890-47c1-9d6d-1492782cf712'),
  'Non-member cannot see another org''s property once unpublished'
);
select ok(
  not exists(select 1 from public.spaces where property_id = '57f914ac-3890-47c1-9d6d-1492782cf712'),
  'Non-member cannot see another org''s spaces once the property is unpublished'
);

-- Cannot grab a not-yet-taken subdomain for a brand-new property, or move
-- an owned property's domain columns — both blocked purely by GRANT: no
-- INSERT grant on properties for authenticated at all, and the UPDATE
-- grant excludes subdomain/custom_domain/org_id/slug.
select throws_like(
  $$insert into public.properties (slug, name, whatsapp_number, subdomain, org_id)
    values ('land-grab', 'x', '1', 'land-grab', 'bf88f504-051f-4fdc-ab73-4fa12d715817')$$,
  '%permission denied%',
  'Cannot insert a new property at all (creation is a platform/superadmin operation)'
);
select throws_like(
  $$update public.properties set subdomain = 'stolen' where id = '131583b5-785e-4127-81f0-e097163c5654'$$,
  '%permission denied%',
  'Cannot change one''s own property''s subdomain (column-scoped GRANT excludes it)'
);

-- ─── As Demo's own owner — their own data stays visible regardless ─────────
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
select ok(
  exists(select 1 from public.properties where id = '57f914ac-3890-47c1-9d6d-1492782cf712'),
  'Member can still see their own property even when unpublished'
);
select ok(
  exists(select 1 from public.spaces where property_id = '57f914ac-3890-47c1-9d6d-1492782cf712'),
  'Member can still see their own spaces even when the property is unpublished'
);

select lives_ok(
  $$insert into public.spaces (key, category, property_id, org_id, label_en, label_es)
    values ('legit', 'rooms', '57f914ac-3890-47c1-9d6d-1492782cf712',
            'ff24bacc-47d2-40bc-9210-f860e98892fd', 'x', 'x')$$,
  'Member can insert a room for their own property'
);

-- ─── anon (no session at all) ────────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
set local role anon;

select ok(
  not exists(select 1 from public.properties where id = '57f914ac-3890-47c1-9d6d-1492782cf712'),
  'anon cannot see an unpublished property'
);
select ok(
  exists(select 1 from public.properties where id = '131583b5-785e-4127-81f0-e097163c5654'),
  'anon can see a published property (public site keeps working)'
);

-- Confirms the SD-002 GRANT-narrowing fix independently of RLS: this fails
-- at the permission layer, before RLS's with-check ever runs.
select throws_like(
  $$insert into public.amenities (property_id, org_id, title_en, title_es)
    values ('131583b5-785e-4127-81f0-e097163c5654', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'x', 'x')$$,
  '%permission denied%',
  'anon cannot insert into a business table at all (GRANT narrowing, not just RLS)'
);

select * from finish();
rollback;
