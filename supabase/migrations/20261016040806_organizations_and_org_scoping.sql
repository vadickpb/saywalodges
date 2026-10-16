-- SD-101: multi-tenant foundations. Adds organizations/memberships, an
-- is_member() helper for RLS policies (written in SD-102 — this migration
-- only adds the plumbing, no policies yet), and org_id on every existing
-- business table. See docs/adr/0002-rls-and-dal.md.

create table "public"."organizations" (
  "id" uuid not null default gen_random_uuid(),
  "name" text not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "organizations_pkey" primary key (id)
);

alter table "public"."organizations" enable row level security;

create type "public"."membership_role" as enum ('owner', 'staff');

create table "public"."memberships" (
  "org_id" uuid not null,
  "user_id" uuid not null,
  "role" public.membership_role not null default 'staff',
  "created_at" timestamp with time zone not null default now(),
  constraint "memberships_pkey" primary key (org_id, user_id),
  constraint "memberships_org_id_fkey" foreign key (org_id) references public.organizations(id) on delete cascade,
  constraint "memberships_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade
);

create index "memberships_user_id_idx" on public.memberships(user_id);

alter table "public"."memberships" enable row level security;

-- Used by every future RLS policy (SD-102) as `using (is_member(org_id))`.
-- security definer + search_path = '' so it can't be tricked by a session
-- that has shadowed `public.memberships` or `auth.uid` in its search path.
create or replace function public.is_member(target_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships
    where memberships.org_id = target_org_id
      and memberships.user_id = auth.uid()
  );
$$;

-- ─── org_id on existing business tables ─────────────────────────────────────
-- Denormalized onto every child table (not just properties) per ADR 0002, so
-- RLS policies can filter directly on org_id without a join to properties.

alter table "public"."properties" add column "org_id" uuid;
alter table "public"."rooms" add column "org_id" uuid;
alter table "public"."photos" add column "org_id" uuid;
alter table "public"."rate_tiers" add column "org_id" uuid;
alter table "public"."amenities" add column "org_id" uuid;
alter table "public"."distances" add column "org_id" uuid;

-- Backfill: create the Saywa Lodges org and assign it to every row that
-- predates org_id. Fixed id (not gen_random_uuid()) so the already-seeded
-- supabase/seed.sql rows (also using fixed ids) can reference the same org
-- deterministically — this UPDATE is a no-op on a fresh local database
-- where these tables are still empty at migration time (seed.sql runs
-- after all migrations), and is the real backfill on the remote project,
-- which already had this one property before org_id existed.
--
-- Explicit guard (found by security-reviewer): this backfill only makes
-- sense while the project is still genuinely single-tenant. If a second
-- property ever existed before this migration ran, blindly assigning
-- everything to one org would be silently wrong — fail loudly instead.
do $$
begin
  if (select count(*) from "public"."properties") > 1 then
    raise exception 'org_id backfill assumes a single pre-existing property, found %. This migration needs to be revisited before applying it.',
      (select count(*) from "public"."properties");
  end if;
end $$;

insert into "public"."organizations" ("id", "name")
values ('bf88f504-051f-4fdc-ab73-4fa12d715817', 'Saywa Lodges');

update "public"."properties" set "org_id" = 'bf88f504-051f-4fdc-ab73-4fa12d715817' where "org_id" is null;
update "public"."rooms" set "org_id" = 'bf88f504-051f-4fdc-ab73-4fa12d715817' where "org_id" is null;
update "public"."photos" set "org_id" = 'bf88f504-051f-4fdc-ab73-4fa12d715817' where "org_id" is null;
update "public"."rate_tiers" set "org_id" = 'bf88f504-051f-4fdc-ab73-4fa12d715817' where "org_id" is null;
update "public"."amenities" set "org_id" = 'bf88f504-051f-4fdc-ab73-4fa12d715817' where "org_id" is null;
update "public"."distances" set "org_id" = 'bf88f504-051f-4fdc-ab73-4fa12d715817' where "org_id" is null;

alter table "public"."properties" alter column "org_id" set not null;
alter table "public"."rooms" alter column "org_id" set not null;
alter table "public"."photos" alter column "org_id" set not null;
alter table "public"."rate_tiers" alter column "org_id" set not null;
alter table "public"."amenities" alter column "org_id" set not null;
alter table "public"."distances" alter column "org_id" set not null;

alter table "public"."properties" add constraint "properties_org_id_fkey" foreign key ("org_id") references public.organizations(id) on delete cascade;
alter table "public"."rooms" add constraint "rooms_org_id_fkey" foreign key ("org_id") references public.organizations(id) on delete cascade;
alter table "public"."photos" add constraint "photos_org_id_fkey" foreign key ("org_id") references public.organizations(id) on delete cascade;
alter table "public"."rate_tiers" add constraint "rate_tiers_org_id_fkey" foreign key ("org_id") references public.organizations(id) on delete cascade;
alter table "public"."amenities" add constraint "amenities_org_id_fkey" foreign key ("org_id") references public.organizations(id) on delete cascade;
alter table "public"."distances" add constraint "distances_org_id_fkey" foreign key ("org_id") references public.organizations(id) on delete cascade;

create index "properties_org_id_idx" on public.properties(org_id);
create index "rooms_org_id_idx" on public.rooms(org_id);
create index "photos_org_id_idx" on public.photos(org_id);
create index "rate_tiers_org_id_idx" on public.rate_tiers(org_id);
create index "amenities_org_id_idx" on public.amenities(org_id);
create index "distances_org_id_idx" on public.distances(org_id);

-- ─── Host-based routing columns (used starting SD-105; just schema here) ────

alter table "public"."properties" add column "subdomain" text;
alter table "public"."properties" add column "custom_domain" text;
alter table "public"."properties" add column "published" boolean not null default false;

update "public"."properties" set "subdomain" = "slug", "published" = true where "slug" = 'saywa-lodges';

alter table "public"."properties" alter column "subdomain" set not null;
alter table "public"."properties" add constraint "properties_subdomain_key" unique ("subdomain");
alter table "public"."properties" add constraint "properties_custom_domain_key" unique ("custom_domain");
