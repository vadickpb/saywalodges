-- SD-408: unguessable public token on bookings + a scoped read RPC for the guest status page.
-- Additive. Rollback: drop function public.get_booking_status(text, text); restore
-- private.guard_booking_update() from 20261029185857; alter table public.bookings drop column public_token.
--
-- Trust model
--  * public_token is the guest's capability to see ONE booking's state (256-bit-ish hex, same
--    shape as ical export tokens). It is not the booking id and not the quote token.
--  * anon still has NO table access to bookings (ADR 0002). The only read path is
--    get_booking_status(host, token), SECURITY DEFINER, which returns no PII (no guest name,
--    email, phone, payment references or voucher paths) and only for a PUBLISHED property
--    whose subdomain/custom_domain equals the host the page is served from.
--  * Unknown token, wrong host, unpublished property, malformed input: all return NULL, so
--    the page answers the same 404 and nothing tells those cases apart.
begin;

-- Volatile default is evaluated per existing row, so old bookings are backfilled.
alter table public.bookings
  add column public_token text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
    check (public_token ~ '^[a-f0-9]{64}$');
alter table public.bookings add constraint bookings_public_token_key unique (public_token);

-- The token is a credential: once issued it never changes (and members cannot rewrite it,
-- since nobody but service_role has write grants and the RPCs never touch it).
create or replace function private.guard_booking_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.org_id, new.property_id, new.unit_id, new.guest_id, new.quote_id, new.check_in, new.check_out,
      new.guests, new.currency, new.total_cents, new.deposit_cents, new.public_token)
     is distinct from
     (old.org_id, old.property_id, old.unit_id, old.guest_id, old.quote_id, old.check_in, old.check_out,
      old.guests, old.currency, old.total_cents, old.deposit_cents, old.public_token) then
    raise exception 'booking terms are immutable' using errcode = '55000';
  end if;
  if new.status <> old.status and not (
    (old.status = 'pending_payment' and new.status in ('confirmed', 'cancelled', 'expired'))
    or (old.status = 'confirmed' and new.status = 'cancelled')) then
    raise exception 'invalid booking transition % -> %', old.status, new.status using errcode = '55000';
  end if;
  return new;
end;
$$;

-- voucher: 'none' | 'under_review' | 'rejected'. hold_lapsed: the hold ran out but the sweep
-- has not run yet (the booking is effectively expired unless a voucher is under review).
create function public.get_booking_status(p_host text, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', b.status,
    'check_in', b.check_in,
    'check_out', b.check_out,
    'guests', b.guests,
    'currency', b.currency,
    'total_cents', b.total_cents,
    'deposit_cents', b.deposit_cents,
    'expires_at', b.expires_at,
    'property_name', p.name,
    'unit_name', u.name,
    'voucher', case
      when exists (select 1 from public.payments y where y.booking_id = b.id and y.status = 'pending_review')
        then 'under_review'
      when b.status = 'pending_payment' and exists (
        select 1 from public.payments y where y.booking_id = b.id and y.status = 'rejected')
        then 'rejected'
      else 'none' end,
    'hold_lapsed', b.status = 'pending_payment' and b.expires_at <= now()
  )
  from public.bookings b
  join public.properties p on p.id = b.property_id and p.org_id = b.org_id
  join public.units u on u.id = b.unit_id and u.org_id = b.org_id
  where p_token ~ '^[a-f0-9]{64}$'
    and b.public_token = p_token
    and p.published
    and nullif(lower(p_host), '') in (p.subdomain, p.custom_domain)
$$;
revoke all on function public.get_booking_status(text, text) from public;
grant execute on function public.get_booking_status(text, text) to anon, authenticated, service_role;

commit;
