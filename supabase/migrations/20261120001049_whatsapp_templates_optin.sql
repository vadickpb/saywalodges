-- SD-1009: WhatsApp booking templates and the guest's explicit opt-in.
--  * whatsapp_optins: one row per booking whose guest ticked the (separate, unticked-by-default) WhatsApp box in the checkout,
--    with the evidence: when, the exact text shown, its version and the language. Marketing consent is NOT this table (SD-602).
--    The phone number is not copied here: the message goes to the booking's own guest_phone snapshot.
--  * whatsapp_outbox: one row per booking and kind (confirmation, deposit reminder, arrival reminder, post stay). unique(booking_id, kind)
--    makes the scheduler idempotent: running it twice never queues, and so never sends, a message twice.
--  * cron_claim_whatsapp_message / cron_settle_whatsapp_message: service_role only. The claim queues what is due (only for bookings
--    with an active opt-in), re-checks everything at claim time and returns the data of ONE message. At-most-once: a claim is
--    committed BEFORE contacting Meta and never retried (the Cloud API has no idempotency key; a duplicate WhatsApp is worse than a miss).
--  * create_checkout_booking: the public checkout conversion with the opt-in recorded in the same transaction.
--  * cron_purge_whatsapp: retention (Ley 29733). Default 365 days for the ledger and the outbox; opt-in evidence is kept with the booking.
-- Additive: old clients keep calling create_localized_booking_from_quote and simply never record an opt-in (so never get a WhatsApp).
-- Rollback: drop function public.create_checkout_booking(text,text,text,text,text,boolean,text,text),
--   public.cron_claim_whatsapp_message(integer), public.cron_settle_whatsapp_message(uuid,text),
--   public.cron_purge_whatsapp(integer); drop table public.whatsapp_outbox, public.whatsapp_optins;
begin;

create table public.whatsapp_optins (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  booking_id uuid not null,
  granted_at timestamptz not null default now(),
  text_version text not null check (text_version ~ '^v[0-9]{1,3}$'),
  text_shown text not null check (char_length(text_shown) between 1 and 1000),
  lang text not null check (lang in ('es', 'en')),
  source text not null default 'checkout' check (source in ('checkout')),
  -- Set when the guest withdraws (SD-1012 handles an inbound STOP). From then on nothing is sent for this booking.
  revoked_at timestamptz,
  constraint whatsapp_optins_booking_key unique (booking_id),
  constraint whatsapp_optins_booking_fkey foreign key (booking_id, org_id)
    references public.bookings(id, org_id) on delete cascade
);
create index whatsapp_optins_org_id_idx on public.whatsapp_optins(org_id);
alter table public.whatsapp_optins enable row level security;
-- Evidence is written and read only by the server (service role); no policy, no privilege for anon/authenticated.
revoke all on public.whatsapp_optins from public, anon, authenticated;
grant all on public.whatsapp_optins to service_role;

create table public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  booking_id uuid not null,
  kind text not null check (kind in ('confirmation', 'deposit_reminder', 'arrival_reminder', 'post_stay')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attempted_at timestamptz,
  outcome text check (outcome in ('sent', 'simulated', 'failed', 'skipped')),
  constraint whatsapp_outbox_booking_kind_key unique (booking_id, kind),
  constraint whatsapp_outbox_booking_fkey foreign key (booking_id, org_id)
    references public.bookings(id, org_id) on delete cascade
);
create index whatsapp_outbox_org_id_idx on public.whatsapp_outbox(org_id);
create index whatsapp_outbox_pending_idx on public.whatsapp_outbox(created_at) where attempted_at is null;
alter table public.whatsapp_outbox enable row level security;
revoke all on public.whatsapp_outbox from public, anon, authenticated;
grant all on public.whatsapp_outbox to service_role;

-- ─── Checkout conversion with the opt-in recorded in the same transaction ───
create function public.create_checkout_booking(
  p_token text, p_guest_name text, p_guest_email text, p_guest_phone text, p_lang text,
  p_whatsapp_opt_in boolean, p_whatsapp_text_version text, p_whatsapp_text text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := nullif(btrim(p_guest_phone), '');
  v_result jsonb;
  v_booking uuid;
begin
  if p_whatsapp_opt_in is null or p_lang is null or p_lang not in ('es', 'en') then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  -- An opt-in needs a phone to be meaningful, a known text version and the text that was shown.
  if p_whatsapp_opt_in and (v_phone is null or p_whatsapp_text_version is null or p_whatsapp_text_version !~ '^v[0-9]{1,3}$'
      or p_whatsapp_text is null or char_length(p_whatsapp_text) not between 1 and 1000) then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  v_result := public.create_localized_booking_from_quote(p_token, p_guest_name, p_guest_email, p_guest_phone, p_lang);

  -- A replay (the quote already became a booking) never records or changes consent: the first submission decides.
  if p_whatsapp_opt_in and coalesce((v_result->>'replayed')::boolean, false) = false then
    v_booking := (v_result->>'booking_id')::uuid;
    insert into public.whatsapp_optins (org_id, booking_id, text_version, text_shown, lang)
    select b.org_id, b.id, p_whatsapp_text_version, p_whatsapp_text, p_lang
    from public.bookings b where b.id = v_booking
    on conflict (booking_id) do nothing;
  end if;
  return v_result;
end;
$$;
revoke all on function public.create_checkout_booking(text, text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.create_checkout_booking(text, text, text, text, text, boolean, text, text) to anon, authenticated;

-- ─── Scheduler: queue what is due, claim ONE message ─────────────────────────
-- Only bookings with an active opt-in are ever queued. Windows (America/Lima):
--  confirmation      booking confirmed in the last 48 h (a long outage must not send stale news)
--  deposit_reminder  pending payment, no voucher under review/approved, the last third of the hold left (and > 5 min)
--  arrival_reminder  confirmed, check-in from today up to p_arrival_days ahead
--  post_stay         confirmed, from check-out day 14:00 until 3 days after
create function public.cron_claim_whatsapp_message(p_arrival_days integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.whatsapp_outbox%rowtype;
  b public.bookings%rowtype;
  v_today date := (now() at time zone 'America/Lima')::date;
  v_clock time := (now() at time zone 'America/Lima')::time;
  v_optin public.whatsapp_optins%rowtype;
  v_due boolean;
begin
  if p_arrival_days is null or p_arrival_days not between 0 and 14 then
    raise exception 'invalid days' using errcode = '22023';
  end if;

  insert into public.whatsapp_outbox (org_id, booking_id, kind)
  select b2.org_id, b2.id, k.kind
  from public.bookings b2
  join public.whatsapp_optins o on o.booking_id = b2.id and o.org_id = b2.org_id and o.revoked_at is null
  cross join (values ('confirmation'), ('deposit_reminder'), ('arrival_reminder'), ('post_stay')) as k(kind)
  where b2.guest_phone is not null
    and case k.kind
      when 'confirmation' then b2.status = 'confirmed' and b2.confirmed_at > now() - interval '48 hours'
      when 'deposit_reminder' then b2.status = 'pending_payment' and b2.expires_at > now() + interval '5 minutes'
        and b2.expires_at - now() <= (b2.expires_at - b2.created_at) / 3
        and not exists (select 1 from public.payments p where p.booking_id = b2.id and p.org_id = b2.org_id
                          and p.status in ('pending_review', 'approved'))
      when 'arrival_reminder' then b2.status = 'confirmed' and b2.check_in between v_today and v_today + p_arrival_days
      else b2.status = 'confirmed' and b2.check_out >= v_today - 3
        and (b2.check_out < v_today or (b2.check_out = v_today and v_clock >= time '14:00'))
    end
  on conflict (booking_id, kind) do nothing;

  -- A claim abandoned mid-send (function timeout) is closed as failed, NEVER re-sent: at-most-once.
  update public.whatsapp_outbox
     set outcome = 'failed', updated_at = clock_timestamp()
   where outcome is null and attempted_at is not null and attempted_at < clock_timestamp() - interval '30 minutes';

  select * into e from public.whatsapp_outbox
   where attempted_at is null and outcome is null
   order by created_at, id for update skip locked limit 1;
  if not found then return null; end if;

  update public.whatsapp_outbox set attempted_at = clock_timestamp(), updated_at = clock_timestamp() where id = e.id;

  select * into strict b from public.bookings where id = e.booking_id and org_id = e.org_id;
  select * into v_optin from public.whatsapp_optins where booking_id = e.booking_id and org_id = e.org_id;

  v_due := case e.kind
    when 'confirmation' then b.status = 'confirmed'
    when 'deposit_reminder' then b.status = 'pending_payment' and b.expires_at > now()
      and not exists (select 1 from public.payments p where p.booking_id = b.id and p.org_id = b.org_id
                        and p.status in ('pending_review', 'approved'))
    when 'arrival_reminder' then b.status = 'confirmed' and b.check_in >= v_today
    else b.status = 'confirmed'
  end;

  -- Re-checked at claim time: consent withdrawn, no phone or the booking changed since it was queued → skipped, never sent.
  if v_optin.id is null or v_optin.revoked_at is not null or b.guest_phone is null or not v_due then
    update public.whatsapp_outbox set outcome = 'skipped', updated_at = clock_timestamp() where id = e.id;
    return jsonb_build_object('skip', true);
  end if;

  return jsonb_build_object(
    'id', e.id, 'kind', e.kind, 'org_id', b.org_id, 'booking_id', b.id,
    'opt_in', true, 'lang', b.email_lang, 'phone', b.guest_phone,
    'guest_name', coalesce(b.guest_name, (select g.name from public.guests g where g.id = b.guest_id and g.org_id = b.org_id)),
    'unit', (select u.name from public.units u where u.id = b.unit_id and u.org_id = b.org_id),
    'check_in', b.check_in, 'check_out', b.check_out, 'currency', b.currency, 'deposit_cents', b.deposit_cents,
    'expires_at', b.expires_at
  );
end;
$$;

create function public.cron_settle_whatsapp_message(p_id uuid, p_outcome text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome is null or p_outcome not in ('sent', 'simulated', 'failed', 'skipped') then
    raise exception 'invalid outcome' using errcode = '22023';
  end if;
  update public.whatsapp_outbox set outcome = p_outcome, updated_at = clock_timestamp()
   where id = p_id and attempted_at is not null and outcome is null;
end;
$$;

-- Retention: the ledger (wamid + booking is indirect personal data) and the outbox are deleted after p_days (min 30).
create function public.cron_purge_whatsapp(p_days integer default 365) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages integer;
  v_outbox integer;
begin
  if p_days is null or p_days not between 30 and 3650 then
    raise exception 'invalid days' using errcode = '22023';
  end if;
  delete from public.whatsapp_messages where created_at < now() - make_interval(days => p_days);
  get diagnostics v_messages = row_count;
  delete from public.whatsapp_outbox where created_at < now() - make_interval(days => p_days) and outcome is not null;
  get diagnostics v_outbox = row_count;
  return jsonb_build_object('messages', v_messages, 'outbox', v_outbox);
end;
$$;

revoke all on function public.cron_claim_whatsapp_message(integer), public.cron_settle_whatsapp_message(uuid, text),
  public.cron_purge_whatsapp(integer) from public, anon, authenticated;
grant execute on function public.cron_claim_whatsapp_message(integer), public.cron_settle_whatsapp_message(uuid, text),
  public.cron_purge_whatsapp(integer) to service_role;

commit;
