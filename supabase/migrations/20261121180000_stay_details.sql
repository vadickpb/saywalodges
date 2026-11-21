-- SD-1129: quick stay details. One row per stay with what the owner needs to message the guest: name (the only field that
-- matters), phone, language, party size, arrival time, special requests (closed list + a note) and a reminder date.
--  * A stay is a web/manual booking (booking_id) or an iCal reservation (feed_id + external_uid: stable across date changes, unlike
--    the block id, which is re-created when the dates move). Exactly one of the two keys.
--  * Airbnb's iCal carries the reservation code (HM...) and the last 4 digits of the guest's phone in DESCRIPTION: finish_ical_sync_core
--    now accepts them (optional `code` and `last4` per event) and keeps them in the row WITHOUT touching what the owner typed.
--  * No personal data outlives the stay: a reservation that leaves a (non-empty) feed takes its details with it; disconnecting a feed
--    deletes its details; and cron_purge_stay_details (service_role, daily with the WhatsApp purge) removes the details of stays that
--    ended more than p_days ago (default 180) and of bookings cancelled/expired more than 30 days ago. An EMPTY feed snapshot deletes
--    nothing here (Airbnb can answer an empty calendar once by mistake); the purge cleans those later.
--  * Members read (RLS); writes only through save_stay_details (any member: it is not money; the database checks the stay belongs to
--    the member's organization).
-- Additive: the event validator still accepts the old 3-key events. Rollback: drop function public.save_stay_details(...);
--   drop table public.stay_details; re-create private.finish_ical_sync_core from 20261030120000.
begin;

create table public.stay_details (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  booking_id uuid,
  feed_id uuid,
  external_uid text,
  guest_name text check (guest_name is null or char_length(guest_name) between 1 and 200),
  guest_phone text check (guest_phone is null or (char_length(guest_phone) between 5 and 30 and guest_phone ~ '^[0-9+() -]+$')),
  lang text not null default 'es' check (lang in ('es', 'en')),
  party_size smallint check (party_size is null or party_size between 1 and 60),
  arrival_time text check (arrival_time is null or arrival_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  requests text[] not null default '{}' check (
    cardinality(requests) <= 12
    and requests <@ array['crib', 'extra_bed', 'early_checkin', 'late_checkout', 'pet', 'celebration', 'transfer', 'allergy', 'accessibility']::text[]
  ),
  note text check (note is null or char_length(note) <= 500),
  remind_on date,
  -- Airbnb reservation code and last 4 phone digits, read from the iCal feed.
  ref_code text check (ref_code is null or ref_code ~ '^[A-Z0-9]{6,20}$'),
  phone_last4 text check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stay_details_key_check check (
    (booking_id is not null and feed_id is null and external_uid is null)
    or (booking_id is null and feed_id is not null and external_uid is not null)),
  constraint stay_details_booking_fkey foreign key (booking_id, org_id) references public.bookings(id, org_id) on delete cascade,
  constraint stay_details_feed_fkey foreign key (feed_id, org_id) references public.ical_feeds(id, org_id) on delete cascade
);
create unique index stay_details_booking_key on public.stay_details(booking_id) where booking_id is not null;
create unique index stay_details_feed_uid_key on public.stay_details(feed_id, external_uid) where feed_id is not null;
create index stay_details_org_id_idx on public.stay_details(org_id);
create index stay_details_remind_idx on public.stay_details(org_id, remind_on) where remind_on is not null;
alter table public.stay_details enable row level security;
create policy stay_details_select on public.stay_details for select to authenticated using (private.is_member(org_id));
revoke all on public.stay_details from public, anon, authenticated;
grant select on public.stay_details to authenticated;
grant all on public.stay_details to service_role;

-- Save (create or update) the details of one stay. Pass booking_id OR (feed_id, external_uid). Empty text clears a field.
create function public.save_stay_details(
  p_org_id uuid, p_booking_id uuid, p_feed_id uuid, p_external_uid text,
  p_name text, p_phone text, p_lang text, p_party integer, p_arrival text, p_requests text[], p_note text, p_remind_on date
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_phone text := nullif(btrim(p_phone), '');
  v_arrival text := nullif(btrim(p_arrival), '');
  v_note text := nullif(btrim(p_note), '');
begin
  if p_org_id is null or not coalesce(private.is_member(p_org_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (p_booking_id is not null) = (p_feed_id is not null and p_external_uid is not null)
     or (p_booking_id is not null and (p_feed_id is not null or p_external_uid is not null))
     or p_lang is null or p_lang not in ('es', 'en') then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  -- The stay must belong to the caller's organization (same answer for "missing" and "someone else's": no existence oracle).
  if p_booking_id is not null then
    if not exists (select 1 from public.bookings b where b.id = p_booking_id and b.org_id = p_org_id) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.calendar_blocks c where c.feed_id = p_feed_id and c.external_uid = p_external_uid and c.org_id = p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (v_name is not null and char_length(v_name) > 200)
     or v_name ~ U&'[\0001-\001f\007f-\009f\200b-\200f\2028-\202e\2060-\2064\2066-\206f\feff]'
     or (v_phone is not null and (char_length(v_phone) not between 5 and 30 or v_phone !~ '^[0-9+() -]+$'))
     or (v_arrival is not null and v_arrival !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     or (p_party is not null and p_party not between 1 and 60)
     or (v_note is not null and char_length(v_note) > 500)
     or coalesce(cardinality(p_requests), 0) > 12
     or not (coalesce(p_requests, '{}') <@ array['crib', 'extra_bed', 'early_checkin', 'late_checkout', 'pet', 'celebration', 'transfer', 'allergy', 'accessibility']::text[]) then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  if p_booking_id is not null then
    insert into public.stay_details (org_id, booking_id, guest_name, guest_phone, lang, party_size, arrival_time, requests, note, remind_on)
    values (p_org_id, p_booking_id, v_name, v_phone, p_lang, p_party, v_arrival, coalesce(p_requests, '{}'), v_note, p_remind_on)
    on conflict (booking_id) where booking_id is not null do update set
      guest_name = excluded.guest_name, guest_phone = excluded.guest_phone, lang = excluded.lang, party_size = excluded.party_size,
      arrival_time = excluded.arrival_time, requests = excluded.requests, note = excluded.note, remind_on = excluded.remind_on, updated_at = now();
  else
    insert into public.stay_details (org_id, feed_id, external_uid, guest_name, guest_phone, lang, party_size, arrival_time, requests, note, remind_on)
    values (p_org_id, p_feed_id, p_external_uid, v_name, v_phone, p_lang, p_party, v_arrival, coalesce(p_requests, '{}'), v_note, p_remind_on)
    on conflict (feed_id, external_uid) where feed_id is not null do update set
      guest_name = excluded.guest_name, guest_phone = excluded.guest_phone, lang = excluded.lang, party_size = excluded.party_size,
      arrival_time = excluded.arrival_time, requests = excluded.requests, note = excluded.note, remind_on = excluded.remind_on, updated_at = now();
  end if;
end;
$$;
revoke all on function public.save_stay_details(uuid, uuid, uuid, text, text, text, text, integer, text, text[], text, date) from public, anon;
grant execute on function public.save_stay_details(uuid, uuid, uuid, text, text, text, text, integer, text, text[], text, date) to authenticated;

-- ─── iCal sync: keep Airbnb's reservation code and phone last-4 (SD-1129) ───────────────────────────────────────────
create or replace function private.finish_ical_sync_core(p_org_id uuid, p_feed_id uuid, p_token uuid, p_events jsonb, p_error text)
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
      or exists (select 1 from jsonb_object_keys(e) k where k not in ('uid', 'start', 'end', 'code', 'last4'))
      or coalesce(e->>'uid', '') !~ '^[a-f0-9]{64}$'
      or coalesce(e->>'start', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(e->>'end', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or (e ? 'code' and coalesce(e->>'code', '') !~ '^[A-Z0-9]{6,20}$')
      or (e ? 'last4' and coalesce(e->>'last4', '') !~ '^[0-9]{4}$') then
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
  -- A reservation that left the feed (cancelled) takes its guest details with it. Not on an empty snapshot (see the header).
  if jsonb_array_length(p_events) > 0 then
    delete from public.stay_details sd where sd.feed_id = f.id and not exists (
      select 1 from jsonb_array_elements(p_events) j where j->>'uid' = sd.external_uid);
  end if;
  delete from public.sync_conflicts where feed_id = f.id;
  for e in select value from jsonb_array_elements(p_events) order by value->>'uid' loop
    s := (e->>'start')::date; d := (e->>'end')::date;
    begin
      insert into public.calendar_blocks(org_id, property_id, unit_id, period, source, feed_id, external_uid)
      values (f.org_id, prop, f.unit_id, daterange(s,d,'[)'), 'ical', f.id, e->>'uid')
      on conflict (feed_id, external_uid) where feed_id is not null do update set period = excluded.period;
      -- Only the two values the feed provides; whatever the owner typed is never overwritten.
      if e ? 'code' or e ? 'last4' then
        insert into public.stay_details(org_id, feed_id, external_uid, ref_code, phone_last4)
        values (f.org_id, f.id, e->>'uid', e->>'code', e->>'last4')
        on conflict (feed_id, external_uid) where feed_id is not null do update set
          ref_code = coalesce(excluded.ref_code, public.stay_details.ref_code),
          phone_last4 = coalesce(excluded.phone_last4, public.stay_details.phone_last4);
      end if;
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

-- ─── Retention ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- Disconnecting a feed (import_url emptied) deletes the guest details that came from it.
create function private.ical_feed_disconnect_stays() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.stay_details where feed_id = new.id and org_id = new.org_id;
  return new;
end;
$$;
revoke all on function private.ical_feed_disconnect_stays() from public, anon, authenticated;
create trigger ical_feed_disconnect_stays after update of import_url on public.ical_feeds
  for each row when (new.import_url is null and old.import_url is not null)
  execute function private.ical_feed_disconnect_stays();

-- Details of stays that are over: iCal stays whose block ended (or vanished) more than p_days ago, bookings checked out more than
-- p_days ago, and bookings cancelled/expired more than 30 days ago. p_days between 30 and 3650.
create function public.cron_purge_stay_details(p_days integer default 180) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Lima')::date;
  v_n integer;
begin
  if p_days is null or p_days not between 30 and 3650 then
    raise exception 'invalid days' using errcode = '22023';
  end if;
  delete from public.stay_details sd where
    (sd.booking_id is not null and exists (
      select 1 from public.bookings b where b.id = sd.booking_id and b.org_id = sd.org_id
        and (b.check_out < v_today - p_days or (b.status in ('cancelled', 'expired') and b.updated_at < now() - interval '30 days'))))
    or (sd.feed_id is not null and (
      exists (select 1 from public.calendar_blocks c where c.feed_id = sd.feed_id and c.external_uid = sd.external_uid and upper(c.period) < v_today - p_days)
      or (not exists (select 1 from public.calendar_blocks c where c.feed_id = sd.feed_id and c.external_uid = sd.external_uid)
          and sd.updated_at < now() - make_interval(days => p_days))));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.cron_purge_stay_details(integer) from public, anon, authenticated;
grant execute on function public.cron_purge_stay_details(integer) to service_role;

commit;
