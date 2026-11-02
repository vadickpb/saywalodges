-- SD-1008: ledger of WhatsApp template messages sent through the Cloud API, and their delivery status.
-- Rollback: drop function public.log_whatsapp_message(uuid, text, text, text, text, uuid),
--   public.record_whatsapp_status(text, text, timestamptz, text); drop table public.whatsapp_messages;
--
-- Trust model
--  * No table access for anon/authenticated (RLS on, no policies, privileges revoked): the ledger is written and read only
--    by the server with the service role, through the two RPCs below (service_role execute only).
--  * PRIVACY: the recipient's phone number is NOT stored. Only the provider's message id (wamid), the template name, the
--    language, an optional booking and the delivery status. Nothing in here identifies a guest by itself.
--  * Status only moves forward (sent → delivered → read); `failed` only replaces `sent`. Meta delivers webhooks at least
--    once and out of order, so a duplicate or late event must change nothing: record_whatsapp_status answers 'ignored'.
begin;

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  booking_id uuid,
  template text not null check (char_length(template) between 1 and 512 and template ~ '^[a-z0-9_]+$'),
  language text not null check (language ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  -- The id Meta returns ("wamid.…"); `sim_…` for simulated sends. Unique: it is the key webhooks refer to.
  wamid text not null unique check (char_length(wamid) between 1 and 200),
  mode text not null check (mode in ('simulate', 'live')),
  status text not null default 'sent' check (status in ('sent', 'delivered', 'read', 'failed')),
  -- Meta's numeric error code (e.g. 131026) or a short code; never free text.
  error_code text check (error_code is null or error_code ~ '^[0-9A-Za-z_.-]{1,40}$'),
  created_at timestamptz not null default now(),
  status_at timestamptz not null default now(),
  constraint whatsapp_messages_booking_fkey foreign key (booking_id, org_id)
    references public.bookings(id, org_id) on delete cascade
);
create index whatsapp_messages_org_id_idx on public.whatsapp_messages(org_id);
create index whatsapp_messages_booking_id_idx on public.whatsapp_messages(booking_id) where booking_id is not null;

alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_messages from public, anon, authenticated;

-- Records a message the server has just handed to Meta. Idempotent per wamid.
create function public.log_whatsapp_message(
  p_org_id uuid, p_template text, p_language text, p_wamid text, p_mode text, p_booking_id uuid default null
) returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.whatsapp_messages (org_id, booking_id, template, language, wamid, mode)
  values (p_org_id, p_booking_id, p_template, p_language, p_wamid, p_mode)
  on conflict (wamid) do update set wamid = excluded.wamid
  returning id;
$$;
revoke all on function public.log_whatsapp_message(uuid, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.log_whatsapp_message(uuid, text, text, text, text, uuid) to service_role;

-- Applies one delivery-status event. Returns 'updated', 'ignored' (duplicate, late or out of order) or 'unknown'
-- (no message with that wamid: not ours, or sent before this ledger existed). One statement, so two concurrent copies of
-- the same event cannot both win.
create function public.record_whatsapp_status(
  p_wamid text, p_status text, p_at timestamptz default null, p_error_code text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_status is null or p_status not in ('sent', 'delivered', 'read', 'failed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  update public.whatsapp_messages m
     set status = p_status,
         status_at = coalesce(p_at, now()),
         error_code = case when p_status = 'failed' then p_error_code else m.error_code end
   where m.wamid = p_wamid
     and case p_status
           when 'failed' then m.status = 'sent'
           else (case p_status when 'sent' then 1 when 'delivered' then 2 else 3 end)
                > (case m.status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 99 end)
         end;
  get diagnostics v_updated = row_count;
  if v_updated > 0 then return 'updated'; end if;

  return case when exists (select 1 from public.whatsapp_messages where wamid = p_wamid) then 'ignored' else 'unknown' end;
end;
$$;
revoke all on function public.record_whatsapp_status(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_whatsapp_status(text, text, timestamptz, text) to service_role;

commit;
