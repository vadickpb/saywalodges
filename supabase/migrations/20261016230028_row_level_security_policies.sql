-- SD-102: real RLS policies, using the is_member() primitive SD-101 added.
-- Storage policies and the real Storage path migration are explicitly out
-- of scope here — see SD-202 (the admin API only ever used the service-role
-- key until SD-103/104, so Storage RLS would have no practical effect yet,
-- and moving real production files deserves its own careful, verified pass).

-- ─── Fix: org_id consistency between a child row and its parent property ───
-- Found by security-reviewer during SD-101: nothing tied e.g. rooms.org_id to
-- the org_id of its own property_id. Not exploitable while only the server
-- (service-role, bypasses RLS) writes these tables, but becomes a real gap
-- the moment an insert/update policy below allows a member to write using
-- their own org_id — without this, they could set org_id = <their org> on a
-- row whose property_id belongs to someone else's property.
alter table "public"."properties" add constraint "properties_id_org_id_key" unique ("id", "org_id");

alter table "public"."rooms" drop constraint "rooms_property_id_fkey";
alter table "public"."rooms" add constraint "rooms_property_id_org_id_fkey"
  foreign key ("property_id", "org_id") references public.properties("id", "org_id") on delete cascade;

alter table "public"."photos" drop constraint "photos_property_id_fkey";
alter table "public"."photos" add constraint "photos_property_id_org_id_fkey"
  foreign key ("property_id", "org_id") references public.properties("id", "org_id") on delete cascade;

alter table "public"."rate_tiers" drop constraint "rate_tiers_property_id_fkey";
alter table "public"."rate_tiers" add constraint "rate_tiers_property_id_org_id_fkey"
  foreign key ("property_id", "org_id") references public.properties("id", "org_id") on delete cascade;

alter table "public"."amenities" drop constraint "amenities_property_id_fkey";
alter table "public"."amenities" add constraint "amenities_property_id_org_id_fkey"
  foreign key ("property_id", "org_id") references public.properties("id", "org_id") on delete cascade;

alter table "public"."distances" drop constraint "distances_property_id_fkey";
alter table "public"."distances" add constraint "distances_property_id_org_id_fkey"
  foreign key ("property_id", "org_id") references public.properties("id", "org_id") on delete cascade;

-- Found by security-reviewer reviewing this same migration: the fix above
-- left photos.room_id on a simple FK to rooms(id), so a member could insert
-- (or update) a photo with their own property_id/org_id but a room_id
-- belonging to a room in a different org — RLS and the FK above both pass
-- (the photo's own property_id/org_id pair is genuinely theirs), and the
-- dangling cross-org reference becomes a problem the moment anything (e.g.
-- SD-202's embed queries) reads photos by room rather than by property.
alter table "public"."rooms" add constraint "rooms_id_property_id_key" unique ("id", "property_id");

alter table "public"."photos" drop constraint "photos_room_id_fkey";
alter table "public"."photos" add constraint "photos_room_id_property_id_fkey"
  foreign key ("room_id", "property_id") references public.rooms("id", "property_id") on delete cascade;
-- MATCH SIMPLE (Postgres' default): a null room_id (hero/gallery photos,
-- which aren't tied to a room) skips this check entirely, as intended.

-- ─── Fix: validate subdomain / custom_domain format + reserve infra names ──
-- Found by security-reviewer during SD-101. No normalization trigger (yet) —
-- these columns aren't written by any app code until SD-105, so a strict
-- check (reject instead of silently lowercasing) is enough for now.
alter table "public"."properties" add constraint "properties_subdomain_format"
  check (
    "subdomain" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    and "subdomain" not in (
      'app', 'www', 'api', 'admin', 'dashboard', 'mail', 'ftp',
      'assets', 'static', 'cdn', 'support', 'help', 'blog', 'status', 'docs'
    )
  );

alter table "public"."properties" add constraint "properties_custom_domain_format"
  check (
    "custom_domain" is null
    or "custom_domain" ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  );

-- ─── Fix: https-or-empty CHECK on the URL columns authenticated can write ──
-- Found by security-reviewer in the follow-up pass: once authenticated gets
-- a direct UPDATE grant on properties (below), a member can call PostgREST
-- directly and bypass app/api/admin's zod validation entirely — there was
-- no equivalent check at the database layer. Concretely: maps_url and
-- airbnb_url render as <a href>/<iframe src> on the public site
-- (components/Location.tsx, Footer.tsx, Availability.tsx); a javascript:
-- value there is a stored XSS against that tenant's own site visitors, not
-- just a cosmetic bug. Not exploitable today (SD-103 hasn't shipped login
-- yet, so no real external user can obtain a session), but this closes it
-- at the one layer that holds regardless of which future code path writes
-- here — app server action, a future RPC, or direct REST.
alter table "public"."properties" add constraint "properties_maps_url_format"
  check ("maps_url" = '' or "maps_url" ~ '^https://');
alter table "public"."properties" add constraint "properties_airbnb_url_format"
  check ("airbnb_url" = '' or "airbnb_url" ~ '^https://');
alter table "public"."properties" add constraint "properties_site_url_format"
  check ("site_url" = '' or "site_url" ~ '^https://');

-- ─── private schema: RLS helper functions, not exposed via PostgREST ───────
-- Found by security-reviewer: with EXECUTE granted to PUBLIC by default (the
-- normal state for a new function) and these functions living in "public",
-- they're callable directly as /rest/v1/rpc/is_member — harmless today (no
-- SQL injection surface, a non-uuid argument just fails to parse), but
-- Supabase's own security advisor flags exactly this pattern
-- (*_security_definer_function_executable). "private" isn't in
-- supabase/config.toml's api.schemas, so PostgREST never routes to it, while
-- policies (plain SQL inside Postgres, not HTTP) keep working — they just
-- need EXECUTE on the function and USAGE on the schema, granted below,
-- which has nothing to do with PostgREST's RPC exposure.
create schema if not exists "private";

alter function "public"."is_member"(uuid) set schema "private";

create function "private"."is_property_published"(target_property_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties
    where properties.id = target_property_id
      and properties.published = true
  );
$$;

grant usage on schema "private" to "anon", "authenticated";
grant execute on function "private"."is_member"(uuid) to "anon", "authenticated";
grant execute on function "private"."is_property_published"(uuid) to "anon", "authenticated";

-- ─── GRANT narrowing ─────────────────────────────────────────────────────────
-- Found during SD-002: these tables inherited a broad GRANT (Supabase table
-- editor default) of INSERT/UPDATE/DELETE/SELECT to anon AND authenticated.
-- Harmless only because RLS had zero policies (deny-all). Now that policies
-- exist below, the table-level GRANT is a real gate too — narrow it to what
-- each role can plausibly ever need; RLS still filters every individual row
-- on top of this.
revoke all on table "public"."properties" from "anon", "authenticated";
revoke all on table "public"."rooms" from "anon", "authenticated";
revoke all on table "public"."photos" from "anon", "authenticated";
revoke all on table "public"."rate_tiers" from "anon", "authenticated";
revoke all on table "public"."amenities" from "anon", "authenticated";
revoke all on table "public"."distances" from "anon", "authenticated";
-- Found by security-reviewer: organizations/memberships are new tables (from
-- SD-101) and never got this same revoke, so they kept the same inherited
-- ALL-to-anon/authenticated grant (schema default privileges) the 6 business
-- tables had before SD-002's fix. Not exploitable (no write policies exist,
-- SELECT already returns 0 rows for anon), but the commit that introduced
-- these two tables incorrectly described them as already narrow.
revoke all on table "public"."organizations" from "anon", "authenticated";
revoke all on table "public"."memberships" from "anon", "authenticated";

grant select on table "public"."properties" to "anon", "authenticated";
grant select on table "public"."rooms" to "anon", "authenticated";
grant select on table "public"."photos" to "anon", "authenticated";
grant select on table "public"."rate_tiers" to "anon", "authenticated";
grant select on table "public"."amenities" to "anon", "authenticated";
grant select on table "public"."distances" to "anon", "authenticated";

-- Writes: only authenticated users can ever write, and only to rows RLS lets
-- them (is_member(org_id)). anon never writes.
--
-- properties is intentionally NOT included here for INSERT/DELETE: creating
-- or deleting a property is a platform/superadmin operation (SD-603), not a
-- direct client write — found by security-reviewer: any authenticated
-- member could otherwise insert a brand-new property claiming any
-- not-yet-taken subdomain, or claim a custom_domain belonging to someone
-- else's intended site (SD-604 hasn't added domain-ownership verification
-- yet). UPDATE is column-scoped instead of table-wide, excluding id, org_id,
-- slug, subdomain and custom_domain — exactly the columns that must stay
-- off-limits to a regular member for the same reason, and matching the
-- fields the current admin API (app/api/admin/{content,logo}/route.ts)
-- actually writes.
grant update (
  "name", "whatsapp_number", "whatsapp_message_en", "whatsapp_message_es", "email",
  "maps_url", "airbnb_url", "site_url", "address_locality", "address_region",
  "address_country", "latitude", "longitude", "meta_title_en", "meta_title_es",
  "meta_description_en", "meta_description_es", "meta_keywords_en", "meta_keywords_es",
  "price_range", "star_rating", "pets_allowed", "logo_path", "published"
) on table "public"."properties" to "authenticated";

grant insert, update, delete on table "public"."rooms" to "authenticated";
grant insert, update, delete on table "public"."photos" to "authenticated";
grant insert, update, delete on table "public"."rate_tiers" to "authenticated";
grant insert, update, delete on table "public"."amenities" to "authenticated";
grant insert, update, delete on table "public"."distances" to "authenticated";

-- organizations/memberships: no public need to read these at all; members
-- can read (not write — membership changes are a future, deliberate flow,
-- not a direct table write by any client today).
grant select on table "public"."organizations" to "authenticated";
grant select on table "public"."memberships" to "authenticated";

-- ─── RLS policies ────────────────────────────────────────────────────────────

create policy "properties_select" on "public"."properties"
  for select
  using (private.is_member("org_id") or "published" = true);

create policy "properties_update" on "public"."properties"
  for update
  using (private.is_member("org_id"))
  with check (private.is_member("org_id"));

create policy "organizations_select" on "public"."organizations"
  for select
  using (private.is_member("id"));

create policy "memberships_select" on "public"."memberships"
  for select
  using (private.is_member("org_id"));

-- Same 4-policy shape for every child table: public can SELECT rows whose
-- parent property is published; only members can write, always scoped to
-- their own org_id (which, thanks to the composite FK above, can never point
-- at a property_id that belongs to a different org). Written out explicitly
-- per table (not a dynamic loop) so each policy is directly readable here.

create policy "rooms_select" on "public"."rooms"
  for select
  using (private.is_member("org_id") or private.is_property_published("property_id"));
create policy "rooms_insert" on "public"."rooms"
  for insert
  with check (private.is_member("org_id"));
create policy "rooms_update" on "public"."rooms"
  for update
  using (private.is_member("org_id"))
  with check (private.is_member("org_id"));
create policy "rooms_delete" on "public"."rooms"
  for delete
  using (private.is_member("org_id"));

create policy "photos_select" on "public"."photos"
  for select
  using (private.is_member("org_id") or private.is_property_published("property_id"));
create policy "photos_insert" on "public"."photos"
  for insert
  with check (private.is_member("org_id"));
create policy "photos_update" on "public"."photos"
  for update
  using (private.is_member("org_id"))
  with check (private.is_member("org_id"));
create policy "photos_delete" on "public"."photos"
  for delete
  using (private.is_member("org_id"));

create policy "rate_tiers_select" on "public"."rate_tiers"
  for select
  using (private.is_member("org_id") or private.is_property_published("property_id"));
create policy "rate_tiers_insert" on "public"."rate_tiers"
  for insert
  with check (private.is_member("org_id"));
create policy "rate_tiers_update" on "public"."rate_tiers"
  for update
  using (private.is_member("org_id"))
  with check (private.is_member("org_id"));
create policy "rate_tiers_delete" on "public"."rate_tiers"
  for delete
  using (private.is_member("org_id"));

create policy "amenities_select" on "public"."amenities"
  for select
  using (private.is_member("org_id") or private.is_property_published("property_id"));
create policy "amenities_insert" on "public"."amenities"
  for insert
  with check (private.is_member("org_id"));
create policy "amenities_update" on "public"."amenities"
  for update
  using (private.is_member("org_id"))
  with check (private.is_member("org_id"));
create policy "amenities_delete" on "public"."amenities"
  for delete
  using (private.is_member("org_id"));

create policy "distances_select" on "public"."distances"
  for select
  using (private.is_member("org_id") or private.is_property_published("property_id"));
create policy "distances_insert" on "public"."distances"
  for insert
  with check (private.is_member("org_id"));
create policy "distances_update" on "public"."distances"
  for update
  using (private.is_member("org_id"))
  with check (private.is_member("org_id"));
create policy "distances_delete" on "public"."distances"
  for delete
  using (private.is_member("org_id"));
