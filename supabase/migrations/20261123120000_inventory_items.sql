-- SD-1301: house inventory. One row per object the owner keeps in a bookable unit (villa, apartment, room...), in one of its
-- spaces, or in the property's common areas.
--  * Anchor: unit_id (the whole unit) OR space_id (a space; the space's own unit_id tells which unit, null = common area).
--    Neither = a property-wide item. Both at once is rejected. Composite foreign keys keep the unit/space inside the same
--    property and organization.
--  * Deleting a space keeps its items (they become property-wide); deleting a unit or the property deletes them.
--  * inventory_items: members (owner + staff) read and write through RLS and column grants. It never holds money.
--  * inventory_item_costs: the replacement cost is the owner's private data, so it lives in its own table that only the owner
--    can read or write. No guest path and no staff path reads it.
--  * Guest access: read_house_inventory(host, token_hash, session_hash) reuses the private guide's link + session checks
--    (PP-08) and returns only guest_visible items of active units and common areas, without notes or costs. The guide's links
--    are per organization, so a guest sees the inventory of the whole property; narrowing it to the booked unit needs a link
--    scoped to a unit and belongs to SD-1304.
-- Additive. Rollback: drop function public.read_house_inventory(text,text,text);
--   drop table public.inventory_item_costs, public.inventory_items; drop function private.touch_inventory_item();
begin;

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid,
  space_id uuid,
  name_es text not null check (char_length(btrim(name_es)) between 1 and 120),
  name_en text not null default '' check (char_length(name_en) <= 120),
  quantity integer not null default 1 check (quantity between 0 and 9999),
  category text not null default 'other'
    check (category in ('kitchen', 'bedding', 'bath', 'appliances', 'furniture', 'decor', 'outdoor', 'games', 'safety', 'other')),
  consumable boolean not null default false,
  guest_visible boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_one_anchor check (unit_id is null or space_id is null),
  constraint inventory_items_id_org_key unique (id, org_id),
  constraint inventory_items_property_org_fkey foreign key (property_id, org_id)
    references public.properties(id, org_id) on delete cascade,
  constraint inventory_items_unit_property_fkey foreign key (unit_id, property_id)
    references public.units(id, property_id) on delete cascade,
  constraint inventory_items_space_property_fkey foreign key (space_id, property_id)
    references public.spaces(id, property_id) on delete set null (space_id)
);
create index inventory_items_org_id_idx on public.inventory_items(org_id);
create index inventory_items_unit_id_idx on public.inventory_items(unit_id) where unit_id is not null;
create index inventory_items_space_id_idx on public.inventory_items(space_id) where space_id is not null;

create table public.inventory_item_costs (
  item_id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  replacement_cents integer not null check (replacement_cents between 0 and 100000000),
  currency text not null check (currency in ('PEN', 'USD')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_item_costs_item_fkey foreign key (item_id, org_id)
    references public.inventory_items(id, org_id) on delete cascade
);
create index inventory_item_costs_org_id_idx on public.inventory_item_costs(org_id);

-- updated_at, and a ceiling of items per organization so a runaway import cannot fill the table.
create function private.touch_inventory_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and tg_table_name = 'inventory_items'
     and (select count(*) from public.inventory_items where org_id = new.org_id) >= 5000 then
    raise exception 'inventory limit reached' using errcode = '54000';
  end if;
  new.updated_at = now();
  return new;
end $$;
revoke all on function private.touch_inventory_item() from public, anon, authenticated;
create trigger inventory_items_touch before insert or update on public.inventory_items
  for each row execute function private.touch_inventory_item();
create trigger inventory_item_costs_touch before insert or update on public.inventory_item_costs
  for each row execute function private.touch_inventory_item();

alter table public.inventory_items enable row level security;
alter table public.inventory_item_costs enable row level security;

create policy inventory_items_select on public.inventory_items for select to authenticated using (private.is_member(org_id));
create policy inventory_items_insert on public.inventory_items for insert to authenticated with check (private.is_member(org_id));
create policy inventory_items_update on public.inventory_items for update to authenticated
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy inventory_items_delete on public.inventory_items for delete to authenticated using (private.is_member(org_id));

create policy inventory_item_costs_select on public.inventory_item_costs for select to authenticated using (private.is_owner(org_id));
create policy inventory_item_costs_insert on public.inventory_item_costs for insert to authenticated with check (private.is_owner(org_id));
create policy inventory_item_costs_update on public.inventory_item_costs for update to authenticated
  using (private.is_owner(org_id)) with check (private.is_owner(org_id));
create policy inventory_item_costs_delete on public.inventory_item_costs for delete to authenticated using (private.is_owner(org_id));

-- Tenant, parent and timestamps cannot be changed from the client: only these columns are writable.
revoke all on public.inventory_items, public.inventory_item_costs from public, anon, authenticated;
grant select on public.inventory_items, public.inventory_item_costs to authenticated;
grant insert (org_id, property_id, unit_id, space_id, name_es, name_en, quantity, category, consumable, guest_visible, sort_order, note)
  on public.inventory_items to authenticated;
grant update (unit_id, space_id, name_es, name_en, quantity, category, consumable, guest_visible, sort_order, note)
  on public.inventory_items to authenticated;
grant delete on public.inventory_items to authenticated;
grant insert (item_id, org_id, replacement_cents, currency) on public.inventory_item_costs to authenticated;
grant update (replacement_cents, currency) on public.inventory_item_costs to authenticated;
grant delete on public.inventory_item_costs to authenticated;
grant all on public.inventory_items, public.inventory_item_costs to service_role;

-- Guest read through the private guide session (same checks as read_house_guide). Hides notes, costs, hidden items and
-- inactive units. Returns a flat, ordered list; the app groups it by unit and space.
create function public.read_house_inventory(p_host text, p_token_hash text, p_session_hash text) returns jsonb
language sql security definer stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'unit', u.name,
      'space_es', s.label_es, 'space_en', s.label_en,
      'name_es', i.name_es, 'name_en', i.name_en,
      'quantity', i.quantity, 'category', i.category
    ) order by u.sort_order nulls last, u.name nulls last, s.sort_order nulls last, i.sort_order, i.name_es), '[]'::jsonb)
  from public.house_guide_links l
  join private.house_guide_sessions ss on ss.link_id = l.id and ss.org_id = l.org_id
  join public.properties p on p.org_id = l.org_id
  join public.inventory_items i on i.org_id = l.org_id and i.property_id = p.id
  left join public.spaces s on s.id = i.space_id
  left join public.units u on u.id = coalesce(i.unit_id, s.unit_id)
  where ss.session_hash = p_session_hash and l.token_hash = p_token_hash and ss.expires_at > now()
    and l.expires_at > now() and l.revoked_at is null
    and (p.subdomain = p_host or p.custom_domain = p_host)
    and i.guest_visible and (u.id is null or u.active)
$$;
revoke all on function public.read_house_inventory(text, text, text) from public, anon, authenticated;
grant execute on function public.read_house_inventory(text, text, text) to anon;

commit;
