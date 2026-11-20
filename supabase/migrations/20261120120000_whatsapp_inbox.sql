-- SD-1012: inbound WhatsApp inbox and a single auto-reply per sender per 24 h window.
--  * whatsapp_inbox: one row per inbound message (wamid unique, so Meta's redeliveries are no-ops). It holds the sender's number and the
--    text: personal data (Ley 29733), purged by cron_purge_whatsapp after the same retention as the ledger (default 365 days).
--    Members of the organization read it (RLS); only the server writes.
--  * record_inbound_whatsapp (service_role only): stores the message and decides, atomically and at most once, whether the
--    auto-reply goes out: never twice to the same sender within 24 h (advisory lock per sender + auto_replied_at), never for a
--    stale message (Meta redelivers old events) and never when the caller says no (STOP keyword, auto-reply off).
--    The installation has ONE organization (ADR 0010): with zero or several, nothing is stored (a message cannot be attributed).
--  * revoke_whatsapp_optins (service_role only): the guest's STOP withdraws the WhatsApp consent of their bookings.
--    Match = the full international number (a bare 9-digit booking number is read as Peruvian, like the checkout does).
--  * mark_whatsapp_inbox_read: any member of the organization.
--  * cron_purge_whatsapp is replaced (same signature) to also purge the inbox; the result gains an 'inbox' count.
-- Additive. Rollback: drop function public.record_inbound_whatsapp(text,text,text,text,text,timestamptz,boolean),
--   public.revoke_whatsapp_optins(text), public.mark_whatsapp_inbox_read(uuid); drop table public.whatsapp_inbox;
--   re-create public.cron_purge_whatsapp from 20261120001049.
begin;

create table public.whatsapp_inbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wamid text not null unique check (char_length(wamid) between 1 and 200),
  from_phone text not null check (from_phone ~ '^[0-9]{8,15}$'),
  profile_name text check (profile_name is null or char_length(profile_name) between 1 and 200),
  -- Text messages only; for any other type the body is empty and the type says what it was.
  msg_type text not null check (msg_type ~ '^[a-z_]{1,30}$'),
  body text not null default '' check (char_length(body) <= 4096),
  received_at timestamptz not null,
  read_at timestamptz,
  auto_replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index whatsapp_inbox_org_received_idx on public.whatsapp_inbox(org_id, received_at desc);
create index whatsapp_inbox_sender_idx on public.whatsapp_inbox(from_phone, auto_replied_at) where auto_replied_at is not null;
alter table public.whatsapp_inbox enable row level security;
create policy whatsapp_inbox_select on public.whatsapp_inbox for select to authenticated using (private.is_member(org_id));
revoke all on public.whatsapp_inbox from public, anon, authenticated;
grant select on public.whatsapp_inbox to authenticated;
grant all on public.whatsapp_inbox to service_role;

create function public.record_inbound_whatsapp(
  p_wamid text, p_from text, p_name text, p_body text, p_type text, p_at timestamptz, p_auto_reply boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_orgs integer;
  v_id uuid;
  v_reply boolean := false;
begin
  if p_wamid is null or p_from is null or p_from !~ '^[0-9]{8,15}$' or p_type is null or p_type !~ '^[a-z_]{1,30}$'
     or p_at is null or p_auto_reply is null then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  select count(*), (array_agg(id))[1] into v_orgs, v_org from public.organizations;
  if v_orgs <> 1 then
    return jsonb_build_object('status', 'no_org', 'reply', false);
  end if;

  -- Serialise the decision per sender: two simultaneous messages cannot both earn an auto-reply.
  perform pg_advisory_xact_lock(hashtextextended(p_from, 1012));

  insert into public.whatsapp_inbox (org_id, wamid, from_phone, profile_name, msg_type, body, received_at)
  values (v_org, p_wamid, p_from, nullif(left(btrim(coalesce(p_name, '')), 200), ''), p_type, left(coalesce(p_body, ''), 4096), p_at)
  on conflict (wamid) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('status', 'duplicate', 'reply', false);
  end if;

  if p_auto_reply
     and p_at > now() - interval '30 minutes'
     and not exists (select 1 from public.whatsapp_inbox i
                      where i.from_phone = p_from and i.org_id = v_org and i.id <> v_id
                        and i.auto_replied_at > now() - interval '24 hours') then
    update public.whatsapp_inbox set auto_replied_at = now() where id = v_id;
    v_reply := true;
  end if;
  return jsonb_build_object('status', 'stored', 'reply', v_reply, 'org_id', v_org);
end;
$$;

create function public.revoke_whatsapp_optins(p_from text) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_from is null or p_from !~ '^[0-9]{8,15}$' then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  update public.whatsapp_optins o
     set revoked_at = now()
    from public.bookings b
   where o.booking_id = b.id and o.org_id = b.org_id and o.revoked_at is null
     and b.guest_phone is not null
     -- Full international comparison: a bare 9-digit number is a Peruvian mobile (as the checkout assumes); "00" is an
     -- international prefix. A foreign number that merely shares the last digits does not match.
     and (case when length(regexp_replace(regexp_replace(b.guest_phone, '[^0-9]', '', 'g'), '^00', '')) = 9
               then '51' else '' end || regexp_replace(regexp_replace(b.guest_phone, '[^0-9]', '', 'g'), '^00', '')) = p_from;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create function public.mark_whatsapp_inbox_read(p_org_id uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_org_id is null or not private.is_member(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.whatsapp_inbox set read_at = now() where org_id = p_org_id and read_at is null;
end;
$$;

revoke all on function public.record_inbound_whatsapp(text, text, text, text, text, timestamptz, boolean),
  public.revoke_whatsapp_optins(text), public.mark_whatsapp_inbox_read(uuid) from public, anon, authenticated;
grant execute on function public.record_inbound_whatsapp(text, text, text, text, text, timestamptz, boolean),
  public.revoke_whatsapp_optins(text) to service_role;
grant execute on function public.mark_whatsapp_inbox_read(uuid) to authenticated;

create or replace function public.cron_purge_whatsapp(p_days integer default 365) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages integer;
  v_outbox integer;
  v_inbox integer;
begin
  if p_days is null or p_days not between 30 and 3650 then
    raise exception 'invalid days' using errcode = '22023';
  end if;
  delete from public.whatsapp_messages where created_at < now() - make_interval(days => p_days);
  get diagnostics v_messages = row_count;
  delete from public.whatsapp_outbox where created_at < now() - make_interval(days => p_days) and outcome is not null;
  get diagnostics v_outbox = row_count;
  delete from public.whatsapp_inbox where received_at < now() - make_interval(days => p_days);
  get diagnostics v_inbox = row_count;
  return jsonb_build_object('messages', v_messages, 'outbox', v_outbox, 'inbox', v_inbox);
end;
$$;

commit;
