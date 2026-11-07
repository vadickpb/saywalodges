-- SD-420 (part 1): owner-only, atomic, idempotent import of houses/rooms and their base nightly rate.
-- A unit is matched by name (case-insensitive) inside the organization's property: re-importing the same file
-- updates in place and never duplicates. The base rate (season_id null) is upserted with it. Seasonal rates stay
-- in the existing rates screen. Rollback: drop function public.import_units_and_rates(uuid, jsonb);
-- (rows already imported stay, they are ordinary units and rates).
-- A unit that already exists keeps its active flag: re-importing never reactivates a house the owner switched off.
create or replace function public.import_units_and_rates(p_org_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_property uuid;
  v_unit uuid;
  v_created int := 0;
  v_updated int := 0;
begin
  if p_org_id is null or not coalesce(private.is_owner(p_org_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 200 then
    raise exception 'invalid rows' using errcode = '22023';
  end if;
  select p.id into v_property from public.properties p where p.org_id = p_org_id order by p.created_at, p.id limit 1;
  if v_property is null then
    raise exception 'property missing' using errcode = '55000';
  end if;

  -- Two rows with the same name in one file would silently overwrite each other: refuse the whole batch.
  if (select count(*) <> count(distinct lower(btrim(x.name)))
        from jsonb_to_recordset(p_rows) as x(name text)) then
    raise exception 'invalid row' using errcode = '22023';
  end if;

  for r in
    select * from jsonb_to_recordset(p_rows) as x(
      name text, kind text, max_guests integer, included_guests integer,
      nightly_cents bigint, weekend_nightly_cents bigint, extra_guest_cents bigint, min_nights integer)
  loop
    if r.name is null or char_length(btrim(r.name)) not between 1 and 200
       or r.kind is null or r.kind not in ('entire_place', 'room')
       or r.max_guests is null or r.max_guests not between 1 and 1000
       or r.included_guests is null or r.included_guests not between 1 and r.max_guests
       or r.nightly_cents is null or r.nightly_cents not between 0 and 2000000000
       or (r.weekend_nightly_cents is not null and r.weekend_nightly_cents not between 0 and 2000000000)
       or coalesce(r.extra_guest_cents, 0) not between 0 and 2000000000
       or coalesce(r.min_nights, 1) not between 1 and 365 then
      raise exception 'invalid row' using errcode = '22023';
    end if;

    select u.id into v_unit from public.units u
     where u.org_id = p_org_id and u.property_id = v_property and lower(btrim(u.name)) = lower(btrim(r.name))
     order by u.created_at, u.id limit 1;

    if v_unit is null then
      insert into public.units (org_id, property_id, name, kind, max_guests, included_guests)
      values (p_org_id, v_property, btrim(r.name), r.kind::public.unit_kind, r.max_guests, r.included_guests)
      returning id into v_unit;
      v_created := v_created + 1;
    else
      update public.units set kind = r.kind::public.unit_kind, max_guests = r.max_guests,
             included_guests = r.included_guests
       where id = v_unit;
      v_updated := v_updated + 1;
    end if;

    update public.unit_rates set nightly_cents = r.nightly_cents, weekend_nightly_cents = r.weekend_nightly_cents,
           extra_guest_cents = coalesce(r.extra_guest_cents, 0), min_nights = coalesce(r.min_nights, 1)
     where org_id = p_org_id and unit_id = v_unit and season_id is null;
    if not found then
      insert into public.unit_rates (org_id, property_id, unit_id, nightly_cents, weekend_nightly_cents, extra_guest_cents, min_nights)
      values (p_org_id, v_property, v_unit, r.nightly_cents, r.weekend_nightly_cents, coalesce(r.extra_guest_cents, 0), coalesce(r.min_nights, 1));
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

revoke all on function public.import_units_and_rates(uuid, jsonb) from public, anon;
grant execute on function public.import_units_and_rates(uuid, jsonb) to authenticated;
