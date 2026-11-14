-- SD-211: show the bookable units on the public site.
-- units gain what a guest reads on a card (type, description, bedrooms, beds, bathrooms, order); spaces (and so their photos)
-- may belong to one unit. A space without unit stays a COMMON AREA of the property (pool, garden...), shown once.
-- Writes keep going through the existing member policies; only the column grants are widened.
-- Rollback: alter table public.spaces drop column unit_id; alter table public.units drop column showcase_type, ... (columns below);
-- then restore the previous column grants on public.units. Data typed in these columns is lost.
begin;

alter table public.units
  add column showcase_type text not null default 'house' check (showcase_type in ('house', 'apartment', 'villa', 'room')),
  add column description_es text not null default '' check (char_length(description_es) <= 2000),
  add column description_en text not null default '' check (char_length(description_en) <= 2000),
  add column bedrooms integer not null default 1 check (bedrooms between 0 and 50),
  add column beds integer not null default 1 check (beds between 0 and 100),
  add column bed_details_es text not null default '' check (char_length(bed_details_es) <= 300),
  add column bed_details_en text not null default '' check (char_length(bed_details_en) <= 300),
  add column bathrooms integer not null default 1 check (bathrooms between 0 and 50),
  add column sort_order integer not null default 0 check (sort_order >= 0);

-- Existing houses keep today's order (creation order) until the owner reorders them.
update public.units u set sort_order = n.pos
  from (select id, row_number() over (partition by property_id order by created_at, id) - 1 as pos from public.units) n
 where n.id = u.id;

grant insert (org_id, property_id, name, kind, max_guests, included_guests, active, showcase_type, description_es, description_en,
  bedrooms, beds, bed_details_es, bed_details_en, bathrooms, sort_order) on public.units to authenticated;
grant update (name, kind, max_guests, included_guests, active, showcase_type, description_es, description_en,
  bedrooms, beds, bed_details_es, bed_details_en, bathrooms, sort_order) on public.units to authenticated;

-- A space of a house. The composite key keeps it inside its own property; deleting the house turns its spaces into common
-- areas instead of deleting the owner's photos.
alter table public.spaces add column unit_id uuid;
alter table public.spaces add constraint spaces_unit_property_fkey
  foreign key (unit_id, property_id) references public.units(id, property_id) on delete set null (unit_id);
create index spaces_unit_id_idx on public.spaces(unit_id) where unit_id is not null;

commit;
