-- SD-301: calendar_blocks, the single source of truth for occupied dates (ADR 0003).
-- Every occupation (direct booking, payment hold, iCal import, owner block) is a row;
-- an EXCLUDE constraint makes overlapping rows on one unit impossible, even under
-- concurrent transactions. The app never re-checks availability: it translates the
-- 23P01 (exclusion_violation) the database raises.
--
-- Additive migration. Rollback (destructive; export blocks first):
--   drop function public.create_manual_calendar_block(uuid, uuid, date, date, text);
--   drop function public.delete_manual_calendar_block(uuid, uuid);
--   drop table public.calendar_blocks; drop function private.touch_calendar_block_updated_at();
--   drop type public.calendar_block_source;
-- Keep btree_gist: seasons/unit_rates (SD-205) also depend on it.
--
-- booking_id and feed_id are plain uuid columns on purpose: bookings (SD-401) and
-- ical_feeds (SD-304) do not exist yet. Those tickets add the foreign keys.
-- Writes: members can only READ the table. Manual blocks are written through the two
-- RPCs below; booking and ical rows will be written by RPCs/service-role of their
-- own tickets. No direct INSERT/UPDATE/DELETE is granted to anon or authenticated.
begin;
create extension if not exists btree_gist with schema extensions;

create type public.calendar_block_source as enum ('booking', 'ical', 'manual');

create table public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  -- Stay range [check_in, check_out): check-out day is free for the next check-in.
  period daterange not null,
  source public.calendar_block_source not null,
  booking_id uuid,
  feed_id uuid,
  external_uid text,
  -- Payment holds (source = booking) expire; released by cron / create_booking_from_quote.
  expires_at timestamptz,
  note text check (note is null or char_length(note) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_blocks_unit_org_fkey foreign key (unit_id, org_id)
    references public.units(id, org_id) on delete cascade,
  constraint calendar_blocks_unit_property_fkey foreign key (unit_id, property_id)
    references public.units(id, property_id) on delete cascade,
  constraint calendar_blocks_period_check check (
    not isempty(period)
    and lower_inc(period) and not upper_inc(period)
    and not lower_inf(period) and not upper_inf(period)
    -- 'infinity' is a valid date value, not an open bound: reject it too.
    and isfinite(lower(period)) and isfinite(upper(period))
  ),
  constraint calendar_blocks_source_check check (
    case source
      when 'booking' then booking_id is not null and feed_id is null and external_uid is null
      when 'ical' then feed_id is not null and external_uid is not null and booking_id is null
        and expires_at is null
      when 'manual' then booking_id is null and feed_id is null and external_uid is null
        and expires_at is null
    end
  ),
  constraint calendar_blocks_external_uid_check check (
    external_uid is null or char_length(external_uid) between 1 and 1000
  ),
  -- ADR 0003: no two blocks of the same unit may overlap.
  constraint calendar_blocks_no_overlap exclude using gist (
    unit_id with =, period with &&
  )
);

-- unit_id lookups (and the FK cascade) are served by the exclusion constraint's gist index.
create index calendar_blocks_org_id_idx on public.calendar_blocks(org_id);
create index calendar_blocks_property_id_idx on public.calendar_blocks(property_id);
-- Hold expiry sweep.
create index calendar_blocks_expires_at_idx on public.calendar_blocks(expires_at)
  where expires_at is not null;
-- Upsert target for the iCal sync (SD-305): one row per feed event.
create unique index calendar_blocks_feed_event_key
  on public.calendar_blocks(feed_id, external_uid) where feed_id is not null;
create index calendar_blocks_booking_id_idx on public.calendar_blocks(booking_id)
  where booking_id is not null;

alter table public.calendar_blocks enable row level security;
create policy calendar_blocks_select on public.calendar_blocks for select to authenticated
  using (private.is_member(org_id));
-- No insert/update/delete policies: RLS denies them by default and no grant exists.

revoke all on public.calendar_blocks from public, anon, authenticated;
grant select on public.calendar_blocks to authenticated;
grant all on public.calendar_blocks to service_role;
grant usage on type public.calendar_block_source to authenticated, service_role;

create function private.touch_calendar_block_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_calendar_block_updated_at() from public, anon, authenticated;
create trigger calendar_blocks_updated_at before update on public.calendar_blocks
  for each row execute function private.touch_calendar_block_updated_at();

-- ─── RPCs for manual (owner) blocks ─────────────────────────────────────────
-- SECURITY DEFINER because members have no write grant on the table. Every call
-- checks private.is_member(p_org_id) first, then that the unit belongs to p_org_id,
-- so a multi-org user cannot block a unit of another org by passing its id.
-- Overlaps are NOT pre-checked: the exclusion constraint raises 23P01 and the
-- caller shows a clear message (SD-303). Errors:
--   42501 not a member / unit or block not in that org / block is not manual
--   22023 invalid dates or note      23P01 dates already occupied
create function public.create_manual_calendar_block(
  p_org_id uuid,
  p_unit_id uuid,
  p_start date,
  p_end date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
  v_note text := nullif(btrim(p_note), '');
  v_id uuid;
begin
  if p_org_id is null or not private.is_member(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select u.property_id into v_property
    from public.units u where u.id = p_unit_id and u.org_id = p_org_id;
  if v_property is null then
    raise exception 'unit not found' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
     or p_end <= p_start then
    raise exception 'invalid period' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'note too long' using errcode = '22023';
  end if;

  insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, note)
  values (p_org_id, v_property, p_unit_id, daterange(p_start, p_end, '[)'), 'manual', v_note)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.delete_manual_calendar_block(p_org_id uuid, p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.calendar_block_source;
begin
  if p_org_id is null or not private.is_member(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select b.source into v_source
    from public.calendar_blocks b where b.id = p_block_id and b.org_id = p_org_id
    for update; -- Keep source validation and deletion atomic against privileged writers.
  if v_source is null then
    raise exception 'block not found' using errcode = '42501';
  end if;
  if v_source <> 'manual' then
    -- Booking holds and imported events are released by their own flows.
    raise exception 'only manual blocks can be deleted' using errcode = '42501';
  end if;
  delete from public.calendar_blocks where id = p_block_id and org_id = p_org_id;
end;
$$;

revoke execute on function public.create_manual_calendar_block(uuid, uuid, date, date, text)
  from public, anon;
grant execute on function public.create_manual_calendar_block(uuid, uuid, date, date, text)
  to authenticated;
revoke execute on function public.delete_manual_calendar_block(uuid, uuid) from public, anon;
grant execute on function public.delete_manual_calendar_block(uuid, uuid) to authenticated;
commit;
