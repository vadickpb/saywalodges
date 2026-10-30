-- SD-307. Scheduled iCal sync (service_role only) and persistent alert dedupe. Additive migration.
-- Rollback: drop functions public.cron_list_due_ical_feeds(integer), public.cron_begin_ical_sync(uuid),
--   public.cron_finish_ical_sync(uuid, uuid, jsonb, text), public.cron_claim_ical_alert(uuid, text),
--   public.cron_settle_ical_alert(uuid, uuid, boolean); drop table public.ical_alerts;
--   restore the SD-305 bodies of begin_ical_sync / finish_ical_sync / private.invalidate_ical_sync
--   (copy them back from 20261029120000_ical_sync.sql) and then drop private.begin_ical_sync_core,
--   private.finish_ical_sync_core; alter table public.ical_feeds drop column last_attempt_at, drop column failing_since.
--
-- Trust model
--  * begin/finish_ical_sync keep their owner-only contract for sessions (unchanged grants). Their logic now
--    lives in private cores that take an already-authorised org; the owner RPCs check is_owner and delegate.
--  * The cron_* wrappers resolve the org FROM THE FEED ROW (the caller never supplies one) and are executable by
--    service_role only: anon/authenticated/public cannot call them. They go through the same lease
--    (sync_token + 2 min expiry) and the same all-or-nothing snapshot validation as the owner path.
--  * ical_alerts is the persistent dedupe ledger for owner emails. No table access for anon/authenticated.
begin;

alter table public.ical_feeds
  add column last_attempt_at timestamptz,   -- when the last sync lease was taken (scheduling fairness)
  add column failing_since timestamptz;     -- first failure of the current streak; null while healthy
-- authenticated keeps its explicit column-level SELECT list (SD-305): the new columns are internal.

-- A new URL starts a fresh history.
create or replace function private.invalidate_ical_sync() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.import_url is distinct from old.import_url then
    new.sync_token := null;
    new.sync_started_at := null;
    new.last_synced_at := null;
    new.last_error := null;
    new.last_attempt_at := null;
    new.failing_since := null;
  end if;
  return new;
end;
$$;

-- ─── Cores (no authorisation inside; callers must have authorised p_org_id) ───
create function private.begin_ical_sync_core(p_org_id uuid, p_feed_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.ical_feeds%rowtype; t uuid := gen_random_uuid();
begin
  select * into f from public.ical_feeds where id = p_feed_id and org_id = p_org_id for update;
  if not found or f.import_url is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if f.sync_token is not null and f.sync_started_at > clock_timestamp() - interval '2 minutes' then
    return null;
  end if;
  update public.ical_feeds set sync_token = t, sync_started_at = clock_timestamp(), last_attempt_at = clock_timestamp() where id = f.id;
  return jsonb_build_object('token', t, 'url', f.import_url);
end;
$$;

create function private.finish_ical_sync_core(p_org_id uuid, p_feed_id uuid, p_token uuid, p_events jsonb, p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare f public.ical_feeds%rowtype; e jsonb; s date; d date; prop uuid; sources public.calendar_block_source[];
begin
  select * into f from public.ical_feeds where id = p_feed_id and org_id = p_org_id for update;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_token is null or f.sync_token is distinct from p_token then return false; end if;
  if p_error is not null then
    if p_error not in ('URL', 'NETWORK', 'SIZE', 'FORMAT') then raise exception 'invalid error' using errcode = '22023'; end if;
    update public.ical_feeds set last_error = p_error, failing_since = coalesce(failing_since, clock_timestamp()),
      sync_token = null, sync_started_at = null where id = f.id;
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
  update public.ical_feeds set last_synced_at = clock_timestamp(), last_error = null, failing_since = null,
    sync_token = null, sync_started_at = null where id = f.id;
  return true;
end;
$$;
revoke all on function private.begin_ical_sync_core(uuid, uuid) from public, anon, authenticated;
revoke all on function private.finish_ical_sync_core(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;

-- ─── Owner RPCs: same signatures, grants and behaviour; now thin wrappers ─────
create or replace function public.begin_ical_sync(p_org_id uuid, p_feed_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(private.is_owner(p_org_id), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return private.begin_ical_sync_core(p_org_id, p_feed_id);
end;
$$;
create or replace function public.finish_ical_sync(p_org_id uuid, p_feed_id uuid, p_token uuid, p_events jsonb, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(private.is_owner(p_org_id), false) then raise exception 'not allowed' using errcode = '42501'; end if;
  return private.finish_ical_sync_core(p_org_id, p_feed_id, p_token, p_events, p_error);
end;
$$;

-- ─── Cron wrappers: service_role only; org comes from the feed, never from the caller ───
create function public.cron_list_due_ical_feeds(p_limit integer default 25)
returns table (feed_id uuid) language sql stable security definer set search_path = '' as $$
  select f.id from public.ical_feeds f
   where f.import_url is not null
     and (f.last_attempt_at is null or f.last_attempt_at < clock_timestamp() - interval '10 minutes')
     and (f.sync_token is null or f.sync_started_at <= clock_timestamp() - interval '2 minutes')
   order by f.last_attempt_at nulls first, f.id
   limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

create function public.cron_begin_ical_sync(p_feed_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.ical_feeds where id = p_feed_id;
  if v_org is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return private.begin_ical_sync_core(v_org, p_feed_id);
end;
$$;

create function public.cron_finish_ical_sync(p_feed_id uuid, p_token uuid, p_events jsonb, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.ical_feeds where id = p_feed_id;
  if v_org is null then raise exception 'not allowed' using errcode = '42501'; end if;
  return private.finish_ical_sync_core(v_org, p_feed_id, p_token, p_events, p_error);
end;
$$;

-- ─── Alert ledger ────────────────────────────────────────────────────────────
create table public.ical_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  feed_id uuid not null,
  kind text not null check (kind in ('conflict', 'feed_down')),
  -- conflict: md5(uid:period) of one conflict · feed_down: start of the failure streak. No free text, no PII.
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 64),
  claim_id uuid not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  foreign key (feed_id, org_id) references public.ical_feeds(id, org_id) on delete cascade,
  unique (feed_id, kind, dedupe_key)
);
alter table public.ical_alerts enable row level security;
revoke all on public.ical_alerts from public, anon, authenticated;
grant all on public.ical_alerts to service_role;
create index ical_alerts_org_idx on public.ical_alerts (org_id);

-- Claims the alerts of `p_kind` that were never delivered, atomically (feed row lock + unique key), and
-- returns what the mailer needs: owner recipients and a count. null = nothing to send. A claim that is
-- neither settled nor released within 10 minutes (crashed run) is reclaimable.
create function public.cron_claim_ical_alert(p_feed_id uuid, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.ical_feeds%rowtype; v_claim uuid := gen_random_uuid(); v_n integer := 0; v_unit text; v_to text[];
begin
  if p_kind is null or p_kind not in ('conflict', 'feed_down') then raise exception 'invalid kind' using errcode = '22023'; end if;
  select * into f from public.ical_feeds where id = p_feed_id for update;
  if not found then return null; end if;
  select coalesce(array_agg(distinct lower(u.email)) filter (where u.email is not null and u.email <> ''), '{}') into v_to
    from public.memberships m join auth.users u on u.id = m.user_id
   where m.org_id = f.org_id and m.role = 'owner';
  if cardinality(v_to) = 0 then return null; end if;
  delete from public.ical_alerts where feed_id = f.id and sent_at is null and claimed_at < clock_timestamp() - interval '10 minutes';
  if p_kind = 'conflict' then
    with ins as (
      insert into public.ical_alerts(org_id, feed_id, kind, dedupe_key, claim_id)
      select c.org_id, c.feed_id, 'conflict', md5(c.external_uid || ':' || c.period::text), v_claim
        from public.sync_conflicts c where c.feed_id = f.id
      on conflict (feed_id, kind, dedupe_key) do nothing returning 1)
    select count(*) into v_n from ins;
  elsif f.failing_since is not null and f.failing_since <= clock_timestamp() - interval '24 hours' then
    insert into public.ical_alerts(org_id, feed_id, kind, dedupe_key, claim_id)
    values (f.org_id, f.id, 'feed_down', to_char(f.failing_since at time zone 'utc', 'YYYYMMDD"T"HH24MISSUS'), v_claim)
    on conflict (feed_id, kind, dedupe_key) do nothing;
    get diagnostics v_n = row_count;
  end if;
  if v_n = 0 then return null; end if;
  select u.name into v_unit from public.units u where u.id = f.unit_id and u.org_id = f.org_id;
  return jsonb_build_object('claim_id', v_claim, 'channel', f.channel, 'unit_name', v_unit, 'count', v_n, 'recipients', to_jsonb(v_to));
end;
$$;

-- delivered = true marks the claim sent for good; false releases it so a later run retries.
create function public.cron_settle_ical_alert(p_feed_id uuid, p_claim_id uuid, p_delivered boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_delivered then
    update public.ical_alerts set sent_at = clock_timestamp() where feed_id = p_feed_id and claim_id = p_claim_id and sent_at is null;
  else
    delete from public.ical_alerts where feed_id = p_feed_id and claim_id = p_claim_id and sent_at is null;
  end if;
end;
$$;

revoke all on function public.cron_list_due_ical_feeds(integer) from public, anon, authenticated;
revoke all on function public.cron_begin_ical_sync(uuid) from public, anon, authenticated;
revoke all on function public.cron_finish_ical_sync(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.cron_claim_ical_alert(uuid, text) from public, anon, authenticated;
revoke all on function public.cron_settle_ical_alert(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.cron_list_due_ical_feeds(integer), public.cron_begin_ical_sync(uuid),
  public.cron_finish_ical_sync(uuid, uuid, jsonb, text), public.cron_claim_ical_alert(uuid, text),
  public.cron_settle_ical_alert(uuid, uuid, boolean) to service_role;
commit;
