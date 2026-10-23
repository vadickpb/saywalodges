-- SD-205: additive pricing schema. Amounts are integer cents in the property's
-- currency. Dates use [start_date, end_date), in the property's local calendar.
-- No production rates/fees are inserted: the owner configures them in SD-207.
-- Rollback (destructive; export pricing data first): drop fees, unit_rates,
-- seasons, private.touch_pricing_updated_at(), units_pricing_scope_key;
-- drop properties.currency and types fee_kind/currency_code. Keep btree_gist
-- because future calendar blocks (SD-301) may also depend on it.
begin;
create extension if not exists btree_gist with schema extensions;
create type public.currency_code as enum ('PEN', 'USD');
create type public.fee_kind as enum ('per_stay', 'per_night', 'per_guest');

alter table public.properties add column currency public.currency_code not null default 'PEN';
-- Existing Saywa content quotes USD. This sets the unit of account only,
-- without converting any amount or importing the old display-only tiers.
update public.properties set currency = 'USD' where slug = 'saywa-lodges';
grant update (currency) on public.properties to authenticated;

alter table public.units add constraint units_pricing_scope_key unique (id, property_id, org_id);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  start_date date not null,
  end_date date not null,
  priority integer not null default 0 check (priority >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seasons_valid_dates check (isfinite(start_date) and isfinite(end_date) and end_date > start_date),
  constraint seasons_property_org_fkey foreign key (property_id, org_id)
    references public.properties(id, org_id) on delete cascade,
  constraint seasons_pricing_scope_key unique (id, property_id, org_id),
  -- Higher-priority holidays may override a season; adjacent ranges are fine.
  -- Equal-priority overlaps would make the winning rate ambiguous.
  constraint seasons_priority_overlap exclude using gist (
    org_id extensions.gist_uuid_ops with =,
    property_id extensions.gist_uuid_ops with =,
    priority extensions.gist_int4_ops with =,
    daterange(start_date, end_date, '[)') with &&
  )
);

create table public.unit_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  season_id uuid,
  nightly_cents integer not null check (nightly_cents >= 0),
  weekend_nightly_cents integer check (weekend_nightly_cents >= 0),
  extra_guest_cents integer not null default 0 check (extra_guest_cents >= 0),
  min_nights integer not null default 1 check (min_nights > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_rates_unit_scope_fkey foreign key (unit_id, property_id, org_id)
    references public.units(id, property_id, org_id) on delete cascade,
  constraint unit_rates_season_scope_fkey foreign key (season_id, property_id, org_id)
    references public.seasons(id, property_id, org_id) on delete cascade,
  constraint unit_rates_unit_season_key unique (org_id, unit_id, season_id)
);
-- NULL season = base rate; a plain UNIQUE(unit_id, season_id) alone permits
-- duplicate NULLs. No silent choice between competing base rates.
-- Uniqueness/exclusion keys include org_id even where it is functionally
-- implied by the parent. Otherwise a forged cross-org insert could collide
-- before its FK is checked, leaking private row existence through errors.
create unique index unit_rates_one_base_idx on public.unit_rates(org_id, unit_id) where season_id is null;

create table public.fees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  kind public.fee_kind not null,
  amount_cents integer not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fees_unit_scope_fkey foreign key (unit_id, property_id, org_id)
    references public.units(id, property_id, org_id) on delete cascade
);

create index seasons_org_id_idx on public.seasons(org_id);
create index seasons_property_id_idx on public.seasons(property_id);

create index unit_rates_org_id_idx on public.unit_rates(org_id);
create index unit_rates_property_id_idx on public.unit_rates(property_id);

create index fees_org_id_idx on public.fees(org_id);
create index fees_property_id_idx on public.fees(property_id);
create index unit_rates_unit_id_idx on public.unit_rates(unit_id);
create index unit_rates_season_id_idx on public.unit_rates(season_id);
create index fees_unit_id_idx on public.fees(unit_id);

create function private.touch_pricing_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_pricing_updated_at() from public, anon, authenticated;

alter table public.seasons enable row level security;
create policy seasons_select on public.seasons for select to anon, authenticated
  using (private.is_member(org_id) or private.is_property_published(property_id));
create policy seasons_insert on public.seasons for insert to authenticated
  with check (private.is_member(org_id));
create policy seasons_update on public.seasons for update to authenticated
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy seasons_delete on public.seasons for delete to authenticated
  using (private.is_member(org_id));
revoke all on public.seasons from public, anon, authenticated;
grant select on public.seasons to anon, authenticated;
grant insert (org_id, property_id, name, start_date, end_date, priority) on public.seasons to authenticated;
grant update (name, start_date, end_date, priority) on public.seasons to authenticated;
grant delete on public.seasons to authenticated;
grant all on public.seasons to service_role;
create trigger seasons_updated_at before update on public.seasons
  for each row execute function private.touch_pricing_updated_at();

alter table public.unit_rates enable row level security;
create policy unit_rates_select on public.unit_rates for select to anon, authenticated
  using (private.is_member(org_id) or (private.is_property_published(property_id) and exists (
      select 1 from public.units u where u.id = unit_rates.unit_id and u.active
    )));
create policy unit_rates_insert on public.unit_rates for insert to authenticated
  with check (private.is_member(org_id));
create policy unit_rates_update on public.unit_rates for update to authenticated
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy unit_rates_delete on public.unit_rates for delete to authenticated
  using (private.is_member(org_id));
revoke all on public.unit_rates from public, anon, authenticated;
grant select on public.unit_rates to anon, authenticated;
grant insert (org_id, property_id, unit_id, season_id, nightly_cents, weekend_nightly_cents, extra_guest_cents, min_nights) on public.unit_rates to authenticated;
grant update (season_id, nightly_cents, weekend_nightly_cents, extra_guest_cents, min_nights) on public.unit_rates to authenticated;
grant delete on public.unit_rates to authenticated;
grant all on public.unit_rates to service_role;
create trigger unit_rates_updated_at before update on public.unit_rates
  for each row execute function private.touch_pricing_updated_at();

alter table public.fees enable row level security;
create policy fees_select on public.fees for select to anon, authenticated
  using (private.is_member(org_id) or (private.is_property_published(property_id) and exists (
      select 1 from public.units u where u.id = fees.unit_id and u.active
    )));
create policy fees_insert on public.fees for insert to authenticated
  with check (private.is_member(org_id));
create policy fees_update on public.fees for update to authenticated
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy fees_delete on public.fees for delete to authenticated
  using (private.is_member(org_id));
revoke all on public.fees from public, anon, authenticated;
grant select on public.fees to anon, authenticated;
grant insert (org_id, property_id, unit_id, name, kind, amount_cents) on public.fees to authenticated;
grant update (name, kind, amount_cents) on public.fees to authenticated;
grant delete on public.fees to authenticated;
grant all on public.fees to service_role;
create trigger fees_updated_at before update on public.fees
  for each row execute function private.touch_pricing_updated_at();

grant usage on type public.currency_code, public.fee_kind to anon, authenticated, service_role;
commit;
