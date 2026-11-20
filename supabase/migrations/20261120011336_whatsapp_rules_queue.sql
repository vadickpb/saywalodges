-- SD-1010: owner-configurable WhatsApp rules and a send window (America/Lima) for the queue of SD-1009.
--  * whatsapp_rules: one row per organization and message kind: on/off, how many days (arrival: before check-in; post stay: after
--    check-out) and the hours of the day (Lima) in which it may be sent. No row = the defaults below (everything on).
--    Readable by members; written ONLY through set_whatsapp_rule (owner only).
--  * cron_claim_whatsapp_message is replaced (same signature): it queues only what the rules allow, inside the window, and re-checks
--    at claim time. Idempotency is unchanged: unique(booking_id, kind) in whatsapp_outbox, so running the scheduler twice never
--    queues, and so never sends, a message twice. Rows queued outside the window just wait for it.
-- Additive: no existing column or function signature changes. Rollback: drop function public.set_whatsapp_rule(uuid,text,boolean,integer,integer,integer),
--   private.whatsapp_effective_rule(uuid,text,integer); drop table public.whatsapp_rules; re-create public.cron_claim_whatsapp_message from 20261120001049.
begin;

create table public.whatsapp_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('confirmation', 'deposit_reminder', 'arrival_reminder', 'post_stay')),
  enabled boolean not null default true,
  -- arrival_reminder: days before check-in (0-14); post_stay: days after check-out (0-3); ignored by the other kinds.
  offset_days smallint not null default 1 check (offset_days between 0 and 14),
  -- Hours of the day in Lima in which the message may be sent: [window_start, window_end).
  window_start smallint not null default 0 check (window_start between 0 and 23),
  window_end smallint not null default 24 check (window_end between 1 and 24),
  updated_at timestamptz not null default now(),
  constraint whatsapp_rules_org_kind_key unique (org_id, kind),
  constraint whatsapp_rules_window_check check (window_start < window_end),
  constraint whatsapp_rules_offset_check check (kind <> 'post_stay' or offset_days <= 3)
);
create index whatsapp_rules_org_id_idx on public.whatsapp_rules(org_id);
alter table public.whatsapp_rules enable row level security;
create policy whatsapp_rules_select on public.whatsapp_rules for select to authenticated using (private.is_member(org_id));
revoke all on public.whatsapp_rules from public, anon, authenticated;
grant select on public.whatsapp_rules to authenticated;
grant all on public.whatsapp_rules to service_role;

-- Owner only (staff and other organizations are refused).
create function public.set_whatsapp_rule(
  p_org_id uuid, p_kind text, p_enabled boolean, p_offset_days integer, p_window_start integer, p_window_end integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_org_id is null or not private.is_owner(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('confirmation', 'deposit_reminder', 'arrival_reminder', 'post_stay')
     or p_enabled is null or p_offset_days is null or p_offset_days not between 0 and 14
     or (p_kind = 'post_stay' and p_offset_days > 3)
     or p_window_start is null or p_window_end is null or p_window_start not between 0 and 23
     or p_window_end not between 1 and 24 or p_window_start >= p_window_end then
    raise exception 'invalid rule' using errcode = '22023';
  end if;
  insert into public.whatsapp_rules (org_id, kind, enabled, offset_days, window_start, window_end)
  values (p_org_id, p_kind, p_enabled, p_offset_days, p_window_start, p_window_end)
  on conflict (org_id, kind) do update
    set enabled = excluded.enabled, offset_days = excluded.offset_days, window_start = excluded.window_start,
        window_end = excluded.window_end, updated_at = now();
end;
$$;
revoke all on function public.set_whatsapp_rule(uuid, text, boolean, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.set_whatsapp_rule(uuid, text, boolean, integer, integer, integer) to authenticated;

-- Effective rule of (org, kind): the owner's row or the default (on; arrival 9-20 h, post stay 14-20 h, the others any hour).
create function private.whatsapp_effective_rule(p_org_id uuid, p_kind text, p_arrival_days integer)
returns table (enabled boolean, offset_days integer, window_start integer, window_end integer)
language sql
stable
set search_path = ''
as $$
  select coalesce(r.enabled, true),
         coalesce(r.offset_days::integer, case p_kind when 'arrival_reminder' then p_arrival_days else 0 end),
         coalesce(r.window_start::integer, case p_kind when 'arrival_reminder' then 9 when 'post_stay' then 14 else 0 end),
         coalesce(r.window_end::integer, case p_kind when 'arrival_reminder' then 20 when 'post_stay' then 20 else 24 end)
  from (select 1) one
  left join public.whatsapp_rules r on r.org_id = p_org_id and r.kind = p_kind;
$$;
revoke all on function private.whatsapp_effective_rule(uuid, text, integer) from public, anon, authenticated;
grant execute on function private.whatsapp_effective_rule(uuid, text, integer) to service_role;

-- ─── Scheduler (replaces the SD-1009 version; same signature and result shape) ───
create or replace function public.cron_claim_whatsapp_message(p_arrival_days integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.whatsapp_outbox%rowtype;
  b public.bookings%rowtype;
  v_today date := (now() at time zone 'America/Lima')::date;
  v_hour integer := extract(hour from now() at time zone 'America/Lima')::integer;
  v_optin public.whatsapp_optins%rowtype;
  v_rule record;
  v_due boolean;
begin
  if p_arrival_days is null or p_arrival_days not between 0 and 14 then
    raise exception 'invalid days' using errcode = '22023';
  end if;

  -- Queue what the rules allow, only inside the window, only for bookings with an active opt-in.
  insert into public.whatsapp_outbox (org_id, booking_id, kind)
  select b2.org_id, b2.id, k.kind
  from public.bookings b2
  join public.whatsapp_optins o on o.booking_id = b2.id and o.org_id = b2.org_id and o.revoked_at is null
  cross join (values ('confirmation'), ('deposit_reminder'), ('arrival_reminder'), ('post_stay')) as k(kind)
  cross join lateral private.whatsapp_effective_rule(b2.org_id, k.kind, p_arrival_days) r
  where b2.guest_phone is not null
    and r.enabled
    and v_hour >= r.window_start and v_hour < r.window_end
    and case k.kind
      when 'confirmation' then b2.status = 'confirmed' and b2.confirmed_at > now() - interval '48 hours'
      when 'deposit_reminder' then b2.status = 'pending_payment' and b2.expires_at > now() + interval '5 minutes'
        and b2.expires_at - now() <= (b2.expires_at - b2.created_at) / 3
        and not exists (select 1 from public.payments p where p.booking_id = b2.id and p.org_id = b2.org_id
                          and p.status in ('pending_review', 'approved'))
      when 'arrival_reminder' then b2.status = 'confirmed' and b2.check_in between v_today and v_today + r.offset_days
      else b2.status = 'confirmed' and v_today between b2.check_out + r.offset_days and b2.check_out + r.offset_days + 3
    end
  on conflict (booking_id, kind) do nothing;

  -- A claim abandoned mid-send (function timeout) is closed as failed, NEVER re-sent: at-most-once.
  update public.whatsapp_outbox
     set outcome = 'failed', updated_at = clock_timestamp()
   where outcome is null and attempted_at is not null and attempted_at < clock_timestamp() - interval '30 minutes';

  -- Pick one pending row whose window is open right now (an owner may have narrowed it after the row was queued).
  -- A rule that was switched off is picked too, so the row is closed as skipped below instead of waiting forever.
  select e2.* into e
    from public.whatsapp_outbox e2
    cross join lateral private.whatsapp_effective_rule(e2.org_id, e2.kind, p_arrival_days) r
   where e2.attempted_at is null and e2.outcome is null
     and (not r.enabled or (v_hour >= r.window_start and v_hour < r.window_end))
   order by e2.created_at, e2.id
   for update of e2 skip locked
   limit 1;
  if not found then return null; end if;

  update public.whatsapp_outbox set attempted_at = clock_timestamp(), updated_at = clock_timestamp() where id = e.id;

  select * into strict b from public.bookings where id = e.booking_id and org_id = e.org_id;
  select * into v_optin from public.whatsapp_optins where booking_id = e.booking_id and org_id = e.org_id;
  select * into v_rule from private.whatsapp_effective_rule(e.org_id, e.kind, p_arrival_days);

  v_due := case e.kind
    when 'confirmation' then b.status = 'confirmed'
    when 'deposit_reminder' then b.status = 'pending_payment' and b.expires_at > now()
      and not exists (select 1 from public.payments p where p.booking_id = b.id and p.org_id = b.org_id
                        and p.status in ('pending_review', 'approved'))
    when 'arrival_reminder' then b.status = 'confirmed' and b.check_in >= v_today
    -- A post-stay thanks that waited for its window too long expires instead of arriving days late.
    else b.status = 'confirmed' and v_today <= b.check_out + v_rule.offset_days + 3
  end;

  -- Re-checked at claim time: rule switched off, consent withdrawn, no phone or the booking changed → skipped, never sent.
  if not v_rule.enabled or v_optin.id is null or v_optin.revoked_at is not null or b.guest_phone is null or not v_due then
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

commit;
