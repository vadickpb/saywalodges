-- SD-204: bookable inventory, separate from marketing/gallery spaces.
-- Additive migration; rollback before any rates/bookings depend on it:
-- drop table public.units; drop function private.touch_unit_updated_at();
-- drop type public.unit_kind; (destroys unit data, so export it first).
create type public.unit_kind as enum ('entire_place', 'room');

create table public.units (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  kind public.unit_kind not null,
  max_guests integer not null check (max_guests > 0),
  included_guests integer not null check (included_guests > 0 and included_guests <= max_guests),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint units_property_org_fkey foreign key (property_id, org_id)
    references public.properties(id, org_id) on delete cascade,
  constraint units_id_org_key unique (id, org_id),
  constraint units_id_property_key unique (id, property_id)
);

create index units_org_id_idx on public.units(org_id);
create index units_property_id_idx on public.units(property_id);

alter table public.units enable row level security;
create policy units_select on public.units for select to anon, authenticated
  using (private.is_member(org_id) or (active and private.is_property_published(property_id)));
create policy units_insert on public.units for insert to authenticated
  with check (private.is_member(org_id));
create policy units_update on public.units for update to authenticated
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy units_delete on public.units for delete to authenticated
  using (private.is_member(org_id));

-- Keep tenant/parent/id/timestamps immutable through direct REST updates.
revoke all on public.units from public, anon, authenticated;
grant select on public.units to anon, authenticated;
grant insert (org_id, property_id, name, kind, max_guests, included_guests, active)
  on public.units to authenticated;
grant update (name, kind, max_guests, included_guests, active) on public.units to authenticated;
grant delete on public.units to authenticated;
grant all on public.units to service_role;
grant usage on type public.unit_kind to anon, authenticated, service_role;

create function private.touch_unit_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_unit_updated_at() from public, anon, authenticated;
create trigger units_updated_at before update on public.units
  for each row execute function private.touch_unit_updated_at();
