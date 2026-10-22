-- SD-202 (part 2): transactional ordering helpers for the dashboard.
--
-- All are SECURITY INVOKER (the default): they run with the caller's rights,
-- so the existing *_update RLS policies (is_member(org_id)) decide what can be
-- touched — no is_member() re-check is needed and nothing here can reach
-- another org. Each returns the number of rows it changed.
--
-- Position = index in the supplied array (0-based). Each call is atomic and
-- all-or-nothing: if any id does not match (foreign, unknown, duplicated, or
-- outside the photo scope) the function raises and nothing is changed.

create function public.reorder_spaces(p_property_id uuid, p_ids uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  changed integer;
begin
  with done as (
    update public.spaces s
       set sort_order = o.ord - 1
      from unnest(p_ids) with ordinality as o(id, ord)
     where s.id = o.id and s.property_id = p_property_id
    returning 1
  )
  select count(*)::integer into changed from done;
  -- All-or-nothing: an id that is foreign, unknown, duplicated or outside the
  -- scope aborts the call, which rolls the whole reorder back.
  if changed <> coalesce(cardinality(p_ids), 0) then
    raise exception 'reorder_spaces: % of % ids matched', changed, coalesce(cardinality(p_ids), 0);
  end if;
  return changed;
end;
$$;

create function public.reorder_amenities(p_property_id uuid, p_ids uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  changed integer;
begin
  with done as (
    update public.amenities a
       set sort_order = o.ord - 1
      from unnest(p_ids) with ordinality as o(id, ord)
     where a.id = o.id and a.property_id = p_property_id
    returning 1
  )
  select count(*)::integer into changed from done;
  -- All-or-nothing: an id that is foreign, unknown, duplicated or outside the
  -- scope aborts the call, which rolls the whole reorder back.
  if changed <> coalesce(cardinality(p_ids), 0) then
    raise exception 'reorder_amenities: % of % ids matched', changed, coalesce(cardinality(p_ids), 0);
  end if;
  return changed;
end;
$$;

create function public.reorder_distances(p_property_id uuid, p_ids uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  changed integer;
begin
  with done as (
    update public.distances d
       set sort_order = o.ord - 1
      from unnest(p_ids) with ordinality as o(id, ord)
     where d.id = o.id and d.property_id = p_property_id
    returning 1
  )
  select count(*)::integer into changed from done;
  -- All-or-nothing: an id that is foreign, unknown, duplicated or outside the
  -- scope aborts the call, which rolls the whole reorder back.
  if changed <> coalesce(cardinality(p_ids), 0) then
    raise exception 'reorder_distances: % of % ids matched', changed, coalesce(cardinality(p_ids), 0);
  end if;
  return changed;
end;
$$;

-- Orders the photos of ONE scope: p_space_id null = the site's hero/gallery,
-- otherwise that space's photos. Ids outside the scope are not touched.
create function public.reorder_photos(p_property_id uuid, p_ids uuid[], p_space_id uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  changed integer;
begin
  with done as (
    update public.photos p
       set sort_order = o.ord - 1
      from unnest(p_ids) with ordinality as o(id, ord)
     where p.id = o.id and p.property_id = p_property_id
       and p.space_id is not distinct from p_space_id
    returning 1
  )
  select count(*)::integer into changed from done;
  -- All-or-nothing: an id that is foreign, unknown, duplicated or outside the
  -- scope aborts the call, which rolls the whole reorder back.
  if changed <> coalesce(cardinality(p_ids), 0) then
    raise exception 'reorder_photos: % of % ids matched', changed, coalesce(cardinality(p_ids), 0);
  end if;
  return changed;
end;
$$;

-- Makes one site photo the hero and demotes the previous hero to gallery, in
-- one statement. Returns 1 when the photo was found in the site scope.
create function public.set_hero_photo(p_property_id uuid, p_photo_id uuid)
returns integer
language sql
set search_path = ''
as $$
  with target as (
    select id from public.photos
     where id = p_photo_id and property_id = p_property_id and space_id is null
  ), demoted as (
    update public.photos
       set role = 'gallery'
     where property_id = p_property_id and space_id is null
       and role = 'hero' and id <> p_photo_id
       and exists (select 1 from target)
    returning 1
  ), promoted as (
    update public.photos
       set role = 'hero'
     where id in (select id from target)
    returning 1
  )
  select count(*)::integer from promoted;
$$;

-- Not callable by anon (they could not change anything anyway: RLS), and
-- explicit about it.
revoke execute on function public.reorder_spaces(uuid, uuid[]) from public, anon;
revoke execute on function public.reorder_amenities(uuid, uuid[]) from public, anon;
revoke execute on function public.reorder_distances(uuid, uuid[]) from public, anon;
revoke execute on function public.reorder_photos(uuid, uuid[], uuid) from public, anon;
revoke execute on function public.set_hero_photo(uuid, uuid) from public, anon;
grant execute on function public.reorder_spaces(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_amenities(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_distances(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_photos(uuid, uuid[], uuid) to authenticated;
grant execute on function public.set_hero_photo(uuid, uuid) to authenticated;
