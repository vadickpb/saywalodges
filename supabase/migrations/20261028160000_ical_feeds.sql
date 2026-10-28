-- SD-304: per-channel iCal export. One feed per (unit, channel): Airbnb, Booking
-- and so on each get their own secret URL, whose calendar holds every block of the
-- unit EXCEPT the ones imported from that same channel (it already knows them).
-- SD-305 will use import_url / last_synced_at / last_error to pull the channel's
-- own calendar. Additive migration.
-- Rollback: drop function public.get_ical_export(text); drop function public.regenerate_ical_token(uuid, uuid);
--   alter table public.calendar_blocks drop constraint calendar_blocks_feed_fkey;
--   drop table public.ical_feeds; drop type public.ical_channel;
--
-- The export token is a secret URL: whoever has it reads the unit's occupied
-- dates (and nothing else - no names, notes or amounts). The table is therefore
-- owner-only, and the public endpoint calls get_ical_export, a SECURITY DEFINER
-- function that looks the feed up by token and returns only date ranges.

create type public.ical_channel as enum ('airbnb', 'booking', 'vrbo', 'other');

create table public.ical_feeds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null,
  channel public.ical_channel not null,
  -- The channel's own calendar (SD-305 imports it). https only; the host allowlist
  -- and private-address checks live in the importer, which is the one that fetches.
  import_url text check (import_url is null or (import_url ~ '^https://[^[:space:]]+$' and char_length(import_url) <= 2000)),
  -- 244 random bits as 64 hex characters (two v4 uuids; their version/variant nibbles are fixed).
  -- Regenerated with regenerate_ical_token.
  export_token text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    check (export_token ~ '^[a-f0-9]{64}$'),
  last_synced_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ical_feeds_id_org_key unique (id, org_id),
  constraint ical_feeds_unit_fkey foreign key (unit_id, org_id)
    references public.units(id, org_id) on delete cascade,
  constraint ical_feeds_unit_channel_key unique (unit_id, channel),
  -- Target of calendar_blocks' foreign key: a block can only point to a feed of ITS OWN unit.
  constraint ical_feeds_id_unit_key unique (id, unit_id),
  constraint ical_feeds_token_key unique (export_token)
);
create index ical_feeds_org_id_idx on public.ical_feeds (org_id);

create trigger ical_feeds_updated_at before update on public.ical_feeds
  for each row execute function private.touch_finance_updated_at();

-- calendar_blocks.feed_id was a bare uuid until now (SD-301): connect it. Deleting
-- a feed removes the blocks it imported. The key is (feed, unit): a block of one
-- unit (and so one org) can never reference another unit's or org's feed.
alter table public.calendar_blocks
  add constraint calendar_blocks_feed_fkey foreign key (feed_id, unit_id)
  references public.ical_feeds(id, unit_id) on delete cascade;
create index calendar_blocks_feed_idx on public.calendar_blocks (feed_id) where feed_id is not null;

alter table public.ical_feeds enable row level security;
create policy ical_feeds_select on public.ical_feeds for select to authenticated
  using (private.is_owner(org_id));
create policy ical_feeds_insert on public.ical_feeds for insert to authenticated
  with check (private.is_owner(org_id));
create policy ical_feeds_update on public.ical_feeds for update to authenticated
  using (private.is_owner(org_id)) with check (private.is_owner(org_id));
create policy ical_feeds_delete on public.ical_feeds for delete to authenticated
  using (private.is_owner(org_id));

-- The token and the sync status are never written by users: the token only
-- changes through regenerate_ical_token, the status through the importer.
revoke all on public.ical_feeds from public, anon, authenticated;
grant select on public.ical_feeds to authenticated;
grant insert (org_id, unit_id, channel, import_url) on public.ical_feeds to authenticated;
grant update (import_url) on public.ical_feeds to authenticated;
grant delete on public.ical_feeds to authenticated;
grant all on public.ical_feeds to service_role;

-- ─── Regenerate the secret URL ──────────────────────────────────────────────
-- Owner only. The old token stops working immediately.
create function public.regenerate_ical_token(p_org_id uuid, p_feed_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if p_org_id is null or not private.is_owner(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.ical_feeds f set export_token = v_token
   where f.id = p_feed_id and f.org_id = p_org_id;
  if not found then
    raise exception 'feed not found' using errcode = '42501';
  end if;
  return v_token;
end;
$$;
revoke all on function public.regenerate_ical_token(uuid, uuid) from public, anon;
grant execute on function public.regenerate_ical_token(uuid, uuid) to authenticated, service_role;

-- ─── Public export ──────────────────────────────────────────────────────────
-- Called by the /api/ical/[token] route (anon). Returns null for an unknown or
-- malformed token, else the unit's name and its occupied date ranges - and only
-- that. Everything occupying the unit is included (direct bookings, holds not yet
-- released, manual blocks, other channels' imports) except blocks imported from
-- this feed's own channel. Stays that ended more than 30 days ago are left out: the
-- channels only need what is current and ahead, and it bounds the answer.
create function public.get_ical_export(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_feed public.ical_feeds%rowtype;
  v_unit text;
  v_blocks jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    return null;
  end if;
  select * into v_feed from public.ical_feeds f where f.export_token = p_token;
  if not found then
    return null;
  end if;
  select u.name into v_unit from public.units u where u.id = v_feed.unit_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id,
           'starts', lower(b.period),
           'ends', upper(b.period)
         ) order by lower(b.period), b.id), '[]'::jsonb)
    into v_blocks
    from public.calendar_blocks b
   where b.unit_id = v_feed.unit_id
     and upper(b.period) >= (now() at time zone 'America/Lima')::date - 30
     and not (
       b.source = 'ical'
       and exists (select 1 from public.ical_feeds f2 where f2.id = b.feed_id and f2.channel = v_feed.channel)
     );
  return jsonb_build_object('unit', v_unit, 'channel', v_feed.channel, 'blocks', v_blocks);
end;
$$;
revoke all on function public.get_ical_export(text) from public;
grant execute on function public.get_ical_export(text) to anon, authenticated, service_role;
