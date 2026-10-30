-- SD-305. Owner/session RPCs only; no service-role needed in user actions.
-- Rollback: drop sync RPCs / private.invalidate_ical_sync (and trigger),
-- drop sync_conflicts, drop sync_token/sync_started_at from ical_feeds.
begin;
alter table public.ical_feeds add column sync_token uuid, add column sync_started_at timestamptz;
-- Tokens are internal concurrency capabilities, not part of the feed DTO.
revoke select on public.ical_feeds from authenticated;
grant select (id, org_id, unit_id, channel, import_url, export_token, last_synced_at, last_error, created_at, updated_at) on public.ical_feeds to authenticated;

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  feed_id uuid not null,
  external_uid text not null check (external_uid ~ '^[a-f0-9]{64}$'),
  period daterange not null check (not isempty(period) and lower_inc(period) and not upper_inc(period)
    and not lower_inf(period) and not upper_inf(period) and isfinite(lower(period)) and isfinite(upper(period))),
  blocking_sources public.calendar_block_source[] not null,
  created_at timestamptz not null default now(),
  foreign key (feed_id, org_id) references public.ical_feeds(id, org_id) on delete cascade,
  unique (feed_id, external_uid)
);
alter table public.sync_conflicts enable row level security;
create policy sync_conflicts_owner on public.sync_conflicts for select to authenticated using (private.is_owner(org_id));
revoke all on public.sync_conflicts from public, anon, authenticated;
grant select on public.sync_conflicts to authenticated;
grant all on public.sync_conflicts to service_role;
create index sync_conflicts_org_idx on public.sync_conflicts(org_id);

create function private.invalidate_ical_sync() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.import_url is distinct from old.import_url then
    new.sync_token := null;
    new.sync_started_at := null;
    new.last_synced_at := null;
    new.last_error := null;
  end if;
  return new;
end;
$$;
revoke all on function private.invalidate_ical_sync() from public, anon, authenticated;
create trigger ical_sync_url_changed before update of import_url on public.ical_feeds
  for each row execute function private.invalidate_ical_sync();

create function public.begin_ical_sync(p_org_id uuid, p_feed_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.ical_feeds%rowtype; t uuid := gen_random_uuid();
begin
  if not coalesce(private.is_owner(p_org_id), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into f from public.ical_feeds where id = p_feed_id and org_id = p_org_id for update;
  if not found or f.import_url is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if f.sync_token is not null and f.sync_started_at > clock_timestamp() - interval '2 minutes' then
    return null;
  end if;
  update public.ical_feeds set sync_token = t, sync_started_at = clock_timestamp() where id = f.id;
  return jsonb_build_object('token', t, 'url', f.import_url);
end;
$$;

-- Validate the entire snapshot before changing any data. Serialize on the feed
-- row, reject stale completions after URL changes / expired lease replacement.
create function public.finish_ical_sync(p_org_id uuid, p_feed_id uuid, p_token uuid, p_events jsonb, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare f public.ical_feeds%rowtype; e jsonb; s date; d date; prop uuid; sources public.calendar_block_source[];
begin
  if not coalesce(private.is_owner(p_org_id), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into f from public.ical_feeds where id = p_feed_id and org_id = p_org_id for update;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_token is null or f.sync_token is distinct from p_token then return false; end if;
  if p_error is not null then
    if p_error not in ('URL', 'NETWORK', 'SIZE', 'FORMAT') then raise exception 'invalid error' using errcode = '22023'; end if;
    update public.ical_feeds set last_error = p_error, sync_token = null, sync_started_at = null where id = f.id;
    return true;
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then raise exception 'invalid events' using errcode = '22023'; end if;
  if jsonb_array_length(p_events) > 2000 then raise exception 'too many events' using errcode = '22023'; end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) <> 'object' or not (e ?& array['uid', 'start', 'end'])
      or (select count(*) from jsonb_object_keys(e)) <> 3
      or coalesce(e->>'uid', '') !~ '^[a-f0-9]{64}$'
      or coalesce(e->>'start', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(e->>'end', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid event' using errcode = '22023';
    end if;
    s := (e->>'start')::date; d := (e->>'end')::date;
    if d <= s then raise exception 'invalid period' using errcode = '22023'; end if;
  end loop;
  if (select count(*) <> count(distinct value->>'uid') from jsonb_array_elements(p_events)) then
    raise exception 'duplicate uid' using errcode = '22023';
  end if;
  select property_id into strict prop from public.units where id = f.unit_id and org_id = f.org_id;
  -- Remove missing events and changed ranges before inserting, so moved events
  -- (including swaps) do not conflict with their own obsolete ranges.
  delete from public.calendar_blocks b where b.feed_id = f.id and not exists (
    select 1 from jsonb_array_elements(p_events) j where j->>'uid' = b.external_uid
      and b.period = daterange((j->>'start')::date, (j->>'end')::date, '[)'));
  delete from public.sync_conflicts where feed_id = f.id;
  for e in select value from jsonb_array_elements(p_events) order by value->>'uid' loop
    s := (e->>'start')::date; d := (e->>'end')::date;
    begin
      insert into public.calendar_blocks(org_id, property_id, unit_id, period, source, feed_id, external_uid)
      values (f.org_id, prop, f.unit_id, daterange(s,d,'[)'), 'ical', f.id, e->>'uid')
      on conflict (feed_id, external_uid) where feed_id is not null do update set period = excluded.period;
    exception when exclusion_violation then
      select coalesce(array_agg(distinct b.source), '{}'::public.calendar_block_source[]) into sources
        from public.calendar_blocks b where b.unit_id = f.unit_id and b.period && daterange(s,d,'[)');
      insert into public.sync_conflicts(org_id, feed_id, external_uid, period, blocking_sources)
      values (f.org_id, f.id, e->>'uid', daterange(s,d,'[)'), sources);
    end;
  end loop;
  update public.ical_feeds set last_synced_at = clock_timestamp(), last_error = null, sync_token = null, sync_started_at = null where id = f.id;
  return true;
end;
$$;
revoke all on function public.begin_ical_sync(uuid, uuid) from public, anon;
revoke all on function public.finish_ical_sync(uuid, uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.begin_ical_sync(uuid, uuid), public.finish_ical_sync(uuid, uuid, uuid, jsonb, text) to authenticated;
commit;
