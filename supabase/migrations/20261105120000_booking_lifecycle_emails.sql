-- SD-407: durable event outbox. No network calls in booking/payment transactions.
-- Additive; rollback requires removing the triggers/functions before dropping the ledger.
begin;
alter table public.bookings add column email_lang text not null default 'es' check (email_lang in ('es', 'en'));
create table public.booking_email_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  booking_id uuid not null,
  payment_id uuid,
  event text not null check (event in ('received','confirmed','rejected','arrival','owner_booking','owner_voucher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attempted_at timestamptz,
  first_attempt_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 3),
  retry_after timestamptz, -- Backoff so a provider outage cannot burn all attempts in one cron run.
  recipients text[], -- Snapshot preserves recipient/key association across retries.

  outcome text check (outcome in ('sent','simulated','failed','skipped')),
  foreign key (booking_id, org_id) references public.bookings(id, org_id) on delete cascade,
  foreign key (payment_id, org_id) references public.payments(id, org_id) on delete cascade,
  check ((event in ('rejected','owner_voucher')) = (payment_id is not null)),
  unique nulls not distinct (booking_id, event, payment_id)
);
create index booking_email_events_org_idx on public.booking_email_events(org_id);
create index booking_email_events_payment_idx on public.booking_email_events(payment_id);
create index booking_email_events_pending_idx on public.booking_email_events(created_at) where attempted_at is null;
alter table public.booking_email_events enable row level security;
-- Internal ledger: even members cannot read/write or reset delivery claims.
revoke all on public.booking_email_events from public, anon, authenticated;
grant all on public.booking_email_events to service_role;

create function private.booking_email_language() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email_lang := coalesce(nullif(current_setting('saywa.booking_lang', true), ''), 'es');
  return new;
end;
$$;
create trigger booking_email_language before insert on public.bookings
for each row execute function private.booking_email_language();

-- Existing RPC remains compatible with older deployments (Spanish by default).
create function public.create_localized_booking_from_quote(p_token text, p_guest_name text, p_guest_email text, p_guest_phone text default null, p_lang text default 'es')
returns jsonb language plpgsql set search_path = '' as $$
declare result jsonb; previous text := current_setting('saywa.booking_lang', true);
begin
  if p_lang is null or p_lang not in ('es','en') then raise exception 'invalid language' using errcode = '22023'; end if;
  perform set_config('saywa.booking_lang', p_lang, true);
  result := public.create_booking_from_quote(p_token, p_guest_name, p_guest_email, p_guest_phone);
  perform set_config('saywa.booking_lang', coalesce(previous, ''), true);
  return result;
end;
$$;
revoke all on function public.create_localized_booking_from_quote(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_localized_booking_from_quote(text,text,text,text,text) to anon, authenticated;

create function private.enqueue_booking_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'bookings' then
    if tg_op = 'INSERT' then
      insert into public.booking_email_events(org_id,booking_id,event)
      values (new.org_id,new.id,'received'),(new.org_id,new.id,'owner_booking') on conflict do nothing;
    elsif new.status = 'confirmed' and old.status <> 'confirmed' then
      insert into public.booking_email_events(org_id,booking_id,event)
      values (new.org_id,new.id,'confirmed') on conflict do nothing;
    end if;
  else
    if new.voucher_path is not null and (tg_op = 'INSERT' or old.voucher_path is null) then
      insert into public.booking_email_events(org_id,booking_id,payment_id,event)
      values (new.org_id,new.booking_id,new.id,'owner_voucher') on conflict do nothing;
    end if;
    if new.status = 'rejected' and (tg_op = 'INSERT' or old.status <> 'rejected') then
      insert into public.booking_email_events(org_id,booking_id,payment_id,event)
      values (new.org_id,new.booking_id,new.id,'rejected') on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enqueue_booking_email(), private.booking_email_language() from public, anon, authenticated;
create trigger booking_email_enqueue after insert or update on public.bookings for each row execute function private.enqueue_booking_email();
create trigger payment_email_enqueue after insert or update on public.payments for each row execute function private.enqueue_booking_email();

-- Claim ONE event per transaction; retry transient failures/abandoned leases at most three times.
create function public.cron_claim_booking_email(p_arrival_days integer default 3)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.booking_email_events%rowtype; b public.bookings%rowtype; v_recipients text[]; recipient_email text;
begin
  if p_arrival_days is null or p_arrival_days not between 0 and 30 then raise exception 'invalid days' using errcode = '22023'; end if;
  insert into public.booking_email_events(org_id,booking_id,event)
    select org_id,id,'arrival' from public.bookings
    where status = 'confirmed' and check_in between (now() at time zone 'America/Lima')::date
      and (now() at time zone 'America/Lima')::date + p_arrival_days
    on conflict do nothing;
  update public.booking_email_events
    set attempted_at = case when attempts < 3 then null else attempted_at end,
      outcome = case when attempts < 3 then null else 'failed' end, updated_at = clock_timestamp()
    where outcome is null and attempted_at < clock_timestamp() - interval '30 minutes';
  select * into e from public.booking_email_events
    where attempted_at is null and outcome is null and attempts < 3
      and (retry_after is null or retry_after <= clock_timestamp()) order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  select * into strict b from public.bookings where id = e.booking_id and org_id = e.org_id;
  update public.booking_email_events set attempted_at = clock_timestamp(), first_attempt_at = coalesce(first_attempt_at, clock_timestamp()),
    attempts = attempts + 1, updated_at = clock_timestamp() where id = e.id;
  if (e.event = 'arrival' and (b.status <> 'confirmed' or b.check_in < (now() at time zone 'America/Lima')::date))
    or (e.event = 'confirmed' and b.status <> 'confirmed')
    or (e.event in ('received','rejected') and b.status in ('expired','cancelled')) then
    update public.booking_email_events set outcome = 'skipped' where id = e.id;
    return jsonb_build_object('skip',true);
  end if;
  if e.event = 'received' and e.first_attempt_at is null then
    select lower(g.email) into recipient_email from public.guests g where g.id = b.guest_id and g.org_id = b.org_id;
    -- Serialize the allowance across all organizations and concurrent cron requests.
    perform pg_advisory_xact_lock(hashtextextended(recipient_email, 407));
    if (select count(*) from public.booking_email_events other
      join public.bookings ob on ob.id = other.booking_id and ob.org_id = other.org_id
      join public.guests g on g.id = ob.guest_id and g.org_id = ob.org_id
      where other.id <> e.id and other.event = 'received' and lower(g.email) = recipient_email
        and other.first_attempt_at > clock_timestamp() - interval '24 hours'
        and other.outcome is distinct from 'skipped') >= 3 then
      update public.booking_email_events set outcome = 'skipped' where id = e.id;
      return jsonb_build_object('skip',true);
    end if;
  end if;
  if e.recipients is not null then
    v_recipients := e.recipients;
  elsif e.event in ('owner_booking','owner_voucher') then
    select array_agg(distinct lower(u.email) order by lower(u.email)) into v_recipients
      from public.memberships m join auth.users u on u.id = m.user_id
      where m.org_id = e.org_id and m.role = 'owner' and u.email is not null;
  else
    select array[g.email] into v_recipients from public.guests g where g.id = b.guest_id and g.org_id = b.org_id;
  end if;
  update public.booking_email_events set recipients = coalesce(v_recipients, '{}'::text[]) where id = e.id;
  return jsonb_build_object('id',e.id,'attempt',e.attempts + 1,'event',e.event,'lang',b.email_lang,
    'recipients',coalesce(to_jsonb(v_recipients),'[]'::jsonb),
    'unit', (select name from public.units where id = b.unit_id and org_id = b.org_id),
    'check_in',b.check_in,'check_out',b.check_out);
end;
$$;
create function public.cron_settle_booking_email(p_id uuid, p_outcome text, p_attempt integer default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_outcome is null or p_outcome not in ('sent','simulated','failed','retry','skipped') then raise exception 'invalid outcome' using errcode = '22023'; end if;
  update public.booking_email_events set outcome = case when p_outcome = 'retry' then
      case when attempts < 3 then null else 'failed' end else p_outcome end,
    attempted_at = case when p_outcome = 'retry' and attempts < 3 then null else attempted_at end,
    retry_after = case when p_outcome = 'retry' and attempts < 3 then clock_timestamp() + attempts * interval '5 minutes' else retry_after end,
    updated_at = clock_timestamp()
    where id = p_id and attempted_at is not null and outcome is null
      and (p_attempt is null or attempts = p_attempt);
end;
$$;
revoke all on function public.cron_claim_booking_email(integer), public.cron_settle_booking_email(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.cron_claim_booking_email(integer), public.cron_settle_booking_email(uuid,text,integer) to service_role;
commit;
