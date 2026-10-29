-- SD-308: public availability for the tenant site (occupied / free only).
-- calendar_blocks stays private (members only, SD-301). Anonymous visitors get ONE
-- narrow door: this SECURITY DEFINER function, which returns bare date ranges and
-- nothing else (no id, source, note, booking, feed or uid), for an active unit of a
-- published property, inside a bounded window.
--
-- Additive migration. Rollback:
--   drop function public.get_public_unit_availability(uuid, uuid, date, date);
--
-- Contract (errors are generic on purpose, no oracle for ids of other tenants):
--   42501 unit not found / inactive / property not published / unit not in that property
--   22023 null, infinite or inverted window, or window longer than 62 days
-- Rows are clipped to [today in America/Lima, today + 731 days): past and far-future
-- occupation is never disclosed. Ranges are half-open [start_date, end_date): the
-- end_date night is free for the next check-in. An expired hold still counts as
-- occupied until it is released (ADR 0003).
begin;

create function public.get_public_unit_availability(
  p_property_id uuid,
  p_unit_id uuid,
  p_from date,
  p_to date
)
returns table (start_date date, end_date date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Lima')::date;
  v_from date;
  v_to date;
begin
  if p_property_id is null or p_unit_id is null or p_from is null or p_to is null
     or not isfinite(p_from) or not isfinite(p_to)
     or p_to <= p_from or p_to - p_from > 62 then
    raise exception 'invalid window' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.units u
    join public.properties p on p.id = u.property_id and p.org_id = u.org_id
    where u.id = p_unit_id
      and u.property_id = p_property_id
      and u.active
      and p.published
  ) then
    raise exception 'not available' using errcode = '42501';
  end if;

  v_from := greatest(p_from, v_today);
  v_to := least(p_to, v_today + 731);
  if v_from >= v_to then
    return;
  end if;

  return query
    select greatest(lower(b.period), v_from), least(upper(b.period), v_to)
    from public.calendar_blocks b
    where b.unit_id = p_unit_id
      and b.property_id = p_property_id
      and b.period && daterange(v_from, v_to, '[)')
    order by 1, 2;
end;
$$;

revoke execute on function public.get_public_unit_availability(uuid, uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.get_public_unit_availability(uuid, uuid, date, date)
  to anon, authenticated, service_role;

commit;
