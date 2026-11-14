-- SD-212: combined units. "Villa completa" is made of "Casa 1" + "Casa 2": occupying the villa occupies both houses, and
-- occupying a house occupies the villa (never the sibling house). ADR 0003 stays true: the exclusion constraint on
-- calendar_blocks is still the only thing that refuses a double booking.
-- How: every real block (booking, iCal, manual) writes SHADOW rows on the related units, in the same transaction.
--  * DOWN shadows (villa -> each house): normal rows under the exclusion constraint. If a house is taken, the shadow insert
--    raises 23P01 and the whole write fails, exactly like a direct double booking. Because they are rows of the house, they also
--    refuse a later house booking on those dates.
--  * UP echoes (house -> villa): informational, so the villa's calendar and the public availability show it as occupied. They
--    are EXCLUDED from the constraint (is_echo), otherwise two houses booked at once would collide on the villa. They never
--    contradict reality: a real villa block cannot exist over a booked house, because its down shadow would have failed.
-- A shadow is a source='manual' row with derived_from = the real block; it is deleted by cascade with it and follows its dates.
-- Shadows cannot be deleted by hand (delete_manual_calendar_block refuses them).
-- A unit is either a parent or a child, never both (no chains, no cycles).
-- Rollback: drop trigger calendar_blocks_shadow_lock / calendar_blocks_shadow_sync on public.calendar_blocks; drop functions
-- private.calendar_block_shadow_lock/sync/sync_block_shadows, public.set_unit_components; restore delete_manual_calendar_block from
-- 20261028132649_calendar_blocks.sql; delete from public.calendar_blocks where derived_from is not null;
-- alter table public.calendar_blocks drop column derived_from; drop table public.unit_components.
begin;

create table public.unit_components (
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  parent_unit_id uuid not null,
  child_unit_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (parent_unit_id, child_unit_id),
  constraint unit_components_not_self check (parent_unit_id <> child_unit_id),
  constraint unit_components_parent_fkey foreign key (parent_unit_id, property_id, org_id)
    references public.units(id, property_id, org_id) on delete cascade,
  constraint unit_components_child_fkey foreign key (child_unit_id, property_id, org_id)
    references public.units(id, property_id, org_id) on delete cascade
);
create index unit_components_child_idx on public.unit_components(child_unit_id);
alter table public.unit_components enable row level security;
create policy unit_components_select on public.unit_components for select to authenticated using (private.is_member(org_id));
revoke all on public.unit_components from public, anon, authenticated;
grant select on public.unit_components to authenticated;
grant all on public.unit_components to service_role;

create function private.unit_components_no_chain()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.unit_components c where c.child_unit_id = new.parent_unit_id)
     or exists (select 1 from public.unit_components c where c.parent_unit_id = new.child_unit_id) then
    raise exception 'a unit cannot be both a combination and a part of one' using errcode = '23514';
  end if;
  -- One combination per part: with two, the shadow of one would not be echoed on the other and its calendar would lie.
  if exists (select 1 from public.unit_components c where c.child_unit_id = new.child_unit_id and c.parent_unit_id <> new.parent_unit_id) then
    raise exception 'a unit can be part of one combination only' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.unit_components_no_chain() from public, anon, authenticated;
create trigger unit_components_no_chain before insert on public.unit_components
  for each row execute function private.unit_components_no_chain();

alter table public.calendar_blocks
  add column derived_from uuid references public.calendar_blocks(id) on delete cascade,
  add column is_echo boolean not null default false,
  add constraint calendar_blocks_derived_check check (
    (derived_from is null and not is_echo) or (derived_from is not null and source = 'manual' and derived_from <> id));
-- Same rule as ADR 0003, except that informational echoes do not count.
alter table public.calendar_blocks drop constraint calendar_blocks_no_overlap;
alter table public.calendar_blocks add constraint calendar_blocks_no_overlap
  exclude using gist (unit_id with =, period with &&) where (not is_echo);
create index calendar_blocks_derived_from_idx on public.calendar_blocks(derived_from) where derived_from is not null;

-- The constraint's index is partial now (no echoes); keep a plain one for unit/date lookups (availability, quotes, FK cascade).
create index calendar_blocks_unit_period_idx on public.calendar_blocks using gist (unit_id, period);

-- Creates the shadows of one real block. Related units: the parts of a combination, or the combinations a part belongs to.
create function private.sync_block_shadows(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.calendar_blocks%rowtype;
  v_name text;
begin
  select * into b from public.calendar_blocks where id = p_block_id and derived_from is null;
  if not found then return; end if;
  select u.name into v_name from public.units u where u.id = b.unit_id;
  delete from public.calendar_blocks where derived_from = b.id;
  insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note, derived_from, is_echo)
  select b.org_id, b.property_id, r.unit_id, b.period, 'manual',
         left('Ocupada por «' || coalesce(v_name, '?') || '»', 500), b.id, r.is_echo
    from (
      select c.child_unit_id as unit_id, false as is_echo from public.unit_components c where c.parent_unit_id = b.unit_id
      union all
      select c.parent_unit_id, true from public.unit_components c where c.child_unit_id = b.unit_id
    ) r;
end;
$$;
revoke all on function private.sync_block_shadows(uuid) from public, anon, authenticated;

-- Serialises writers of one property that touch a combination: without it, a villa block and a house block written at the same
-- time would each wait for the other's shadow (deadlock) instead of one of them getting a clean 23P01.
create function private.calendar_block_shadow_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Only for units that are part of a combination: everywhere else adjacent stays never wait for each other (ADR 0003, SD-301).
  -- Updates that change neither dates nor unit (an iCal sync re-writing the same event) do not need it either.
  -- The race with a combination being defined is closed on the other side: set_unit_components locks the table (see there).
  if new.derived_from is null and (tg_op = 'INSERT' or old.period is distinct from new.period or old.unit_id <> new.unit_id)
     and exists (select 1 from public.unit_components c where c.parent_unit_id = new.unit_id or c.child_unit_id = new.unit_id) then
    perform pg_advisory_xact_lock(hashtextextended('combined:' || new.property_id::text, 0));
  end if;
  return new;
end;
$$;
revoke all on function private.calendar_block_shadow_lock() from public, anon, authenticated;
create trigger calendar_blocks_shadow_lock before insert or update of period, unit_id on public.calendar_blocks
  for each row execute function private.calendar_block_shadow_lock();

create function private.calendar_block_shadow_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.derived_from is null and (tg_op = 'INSERT' or old.period is distinct from new.period or old.unit_id <> new.unit_id) then
    perform private.sync_block_shadows(new.id);
  end if;
  return null;
end;
$$;
revoke all on function private.calendar_block_shadow_sync() from public, anon, authenticated;
create trigger calendar_blocks_shadow_sync after insert or update of period, unit_id on public.calendar_blocks
  for each row execute function private.calendar_block_shadow_sync();

-- Shadows are managed only by their block.
create or replace function public.delete_manual_calendar_block(p_org_id uuid, p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.calendar_block_source;
  v_derived uuid;
begin
  if p_org_id is null or not private.is_member(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select b.source, b.derived_from into v_source, v_derived
    from public.calendar_blocks b where b.id = p_block_id and b.org_id = p_org_id
    for update; -- Keep source validation and deletion atomic against privileged writers.
  if v_source is null then
    raise exception 'block not found' using errcode = '42501';
  end if;
  if v_source <> 'manual' or v_derived is not null then
    -- Booking holds, imported events and the shadows of a combined unit are released by their own flows.
    raise exception 'only manual blocks can be deleted' using errcode = '42501';
  end if;
  delete from public.calendar_blocks where id = p_block_id and org_id = p_org_id;
end;
$$;

-- A lapsed hold of a villa leaves shadows on its houses (and the other way round): release the holds of the related units too, and
-- take the property lock BEFORE deleting, so a house booking and a villa booking cannot wait for each other's rows (deadlock).
create or replace function private.release_expired_holds(p_unit_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
  v_count integer;
begin
  if p_unit_id is not null then
    select u.property_id into v_property from public.units u
     where u.id = p_unit_id and exists (
       select 1 from public.unit_components c where c.parent_unit_id = u.id or c.child_unit_id = u.id);
    if v_property is not null then
      perform pg_advisory_xact_lock(hashtextextended('combined:' || v_property::text, 0));
    end if;
  end if;
  with due as (
    select b.id from public.bookings b
    where b.status = 'pending_payment' and b.expires_at <= now()
      and (p_unit_id is null or b.unit_id = p_unit_id
           or b.unit_id in (select c.child_unit_id from public.unit_components c where c.parent_unit_id = p_unit_id
                            union select c.parent_unit_id from public.unit_components c where c.child_unit_id = p_unit_id))
      and not exists (select 1 from public.payments p where p.booking_id = b.id and p.status = 'pending_review')
    order by b.id
    for update skip locked
  ), expired as (
    update public.bookings b set status = 'expired', expires_at = null
    from due where b.id = due.id returning b.id
  ), freed as (
    delete from public.calendar_blocks cb
    using expired where cb.booking_id = expired.id and cb.source = 'booking' returning cb.id
  )
  select count(*)::integer into v_count from expired;
  return v_count;
end;
$$;
revoke all on function private.release_expired_holds(uuid) from public, anon, authenticated;

-- Owner sets which units make up a combination (empty array = no longer a combination). Existing blocks are re-synchronised;
-- if one of them collides (the villa and a house are already booked for the same dates) the whole change fails with 23P01.
create function public.set_unit_components(p_org_id uuid, p_parent_unit_id uuid, p_child_unit_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
  v_children uuid[] := coalesce(p_child_unit_ids, '{}');
  v_ids uuid[];
  v_block uuid;
begin
  if p_org_id is null or not coalesce(private.is_owner(p_org_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_parent_unit_id is null or cardinality(v_children) > 20 or p_parent_unit_id = any (v_children)
     or cardinality(v_children) <> (select count(distinct x) from unnest(v_children) x) then
    raise exception 'invalid units' using errcode = '22023';
  end if;
  select u.property_id into v_property from public.units u where u.id = p_parent_unit_id and u.org_id = p_org_id;
  if v_property is null
     or (select count(*) from public.units u where u.id = any (v_children) and u.org_id = p_org_id and u.property_id = v_property) <> cardinality(v_children) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('combined:' || v_property::text, 0));
  -- A block written right now would not see the combination we are about to commit and would get no shadows: wait for the writers in
  -- flight (they commit or roll back) and hold new ones until we commit. Rare owner action, so a brief calendar pause is fine.
  lock table public.calendar_blocks in share row exclusive mode;

  -- Units whose shadows may change: the old and new parts and the parent.
  select coalesce(array_agg(distinct x), '{}') into v_ids from (
    select p_parent_unit_id as x union all select unnest(v_children)
    union all select c.child_unit_id from public.unit_components c where c.parent_unit_id = p_parent_unit_id) s;

  delete from public.unit_components where parent_unit_id = p_parent_unit_id;
  insert into public.unit_components (org_id, property_id, parent_unit_id, child_unit_id)
  select p_org_id, v_property, p_parent_unit_id, x from unnest(v_children) x;

  -- Drop the shadows of the affected real blocks first, so a stale one cannot collide with a fresh one.
  delete from public.calendar_blocks b where b.derived_from in (
    select r.id from public.calendar_blocks r where r.derived_from is null and r.unit_id = any (v_ids));
  for v_block in select b.id from public.calendar_blocks b where b.derived_from is null and b.unit_id = any (v_ids) order by b.period loop
    perform private.sync_block_shadows(v_block);
  end loop;
  return jsonb_build_object('ok', true, 'parts', cardinality(v_children));
end;
$$;
revoke all on function public.set_unit_components(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.set_unit_components(uuid, uuid, uuid[]) to authenticated;

commit;
