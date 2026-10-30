-- SD-401: guests, quotes, bookings, payments, per-property payment accounts and the
-- transactional booking RPCs (ADR 0003, 0004). Additive migration.
-- Rollback (destructive; export data first): drop functions create_booking_from_quote,
-- confirm_payment, reject_payment, cancel_booking, expire_holds, private.release_expired_holds,
-- private.guard_booking_update, private.guard_payment_update, private.touch_booking_updated_at;
-- drop tables payments, bookings, quotes, guests, property_payment_accounts (in that order);
-- drop types payment_status, payment_method, booking_status, payment_account_kind;
-- alter table properties drop column booking_hold_minutes.
--
-- Trust model
--  * Nothing here accepts a price from a client. A quote is written by the server (SD-402,
--    service-role or a future RPC) from lib/domain/pricing.ts; create_booking_from_quote only
--    copies amounts/dates/unit from the stored quote row.
--  * Members READ bookings/guests/quotes/payments (RLS is_member). Nobody but service_role
--    has write grants: every mutation goes through the SECURITY DEFINER RPCs below.
--  * anon has NO table access (guest PII). anon may execute create_booking_from_quote only:
--    the unguessable quote token is the capability; the RPC returns no PII.
--  * Overlaps are never pre-checked: calendar_blocks' exclusion constraint raises 23P01.
-- Errors: 42501 not allowed / not in that org · 22023 invalid input · P0002 quote not found ·
--   SD001 quote expired · 55000 invalid state transition · 23P01 dates occupied.
begin;

create type public.booking_status as enum ('pending_payment', 'confirmed', 'cancelled', 'expired');
create type public.payment_status as enum ('pending_review', 'approved', 'rejected');
create type public.payment_method as enum ('yape', 'plin', 'bank_transfer', 'mercado_pago', 'cash');
create type public.payment_account_kind as enum ('yape', 'plin', 'bank_account');

-- How long a pending_payment booking holds its dates. Owner-configurable per property.
alter table public.properties
  add column booking_hold_minutes integer not null default 120
  check (booking_hold_minutes between 15 and 4320);
grant update (booking_hold_minutes) on public.properties to authenticated;

create function private.touch_booking_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_booking_updated_at() from public, anon, authenticated;

-- ─── Payment accounts shown to guests (Yape/Plin/bank), per property ─────────
create table public.property_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  kind public.payment_account_kind not null,
  holder_name text not null check (char_length(btrim(holder_name)) between 1 and 200),
  phone text check (phone is null or char_length(phone) between 5 and 30),
  bank_name text check (bank_name is null or char_length(btrim(bank_name)) between 1 and 100),
  account_number text check (account_number is null or char_length(btrim(account_number)) between 4 and 40),
  cci text check (cci is null or cci ~ '^[0-9]{20}$'),
  currency public.currency_code not null default 'PEN',
  instructions text check (instructions is null or char_length(instructions) <= 500),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_payment_accounts_property_fkey foreign key (property_id, org_id)
    references public.properties(id, org_id) on delete cascade,
  constraint property_payment_accounts_kind_check check (
    case kind
      when 'bank_account' then bank_name is not null and account_number is not null and phone is null
      else phone is not null and bank_name is null and account_number is null and cci is null
    end
  )
);
create index property_payment_accounts_org_id_idx on public.property_payment_accounts(org_id);
create index property_payment_accounts_property_id_idx on public.property_payment_accounts(property_id);
create trigger property_payment_accounts_updated_at before update on public.property_payment_accounts
  for each row execute function private.touch_booking_updated_at();

alter table public.property_payment_accounts enable row level security;
-- Members only: account numbers are not public. Guests receive them from a later,
-- booking-scoped endpoint (SD-404/405), never from a table read.
create policy property_payment_accounts_select on public.property_payment_accounts for select to authenticated
  using (private.is_member(org_id));
create policy property_payment_accounts_insert on public.property_payment_accounts for insert to authenticated
  with check (private.is_member(org_id));
create policy property_payment_accounts_update on public.property_payment_accounts for update to authenticated
  using (private.is_member(org_id)) with check (private.is_member(org_id));
create policy property_payment_accounts_delete on public.property_payment_accounts for delete to authenticated
  using (private.is_member(org_id));
revoke all on public.property_payment_accounts from public, anon, authenticated;
grant select, delete on public.property_payment_accounts to authenticated;
grant insert (org_id, property_id, kind, holder_name, phone, bank_name, account_number, cci, currency,
  instructions, active, sort_order) on public.property_payment_accounts to authenticated;
grant update (kind, holder_name, phone, bank_name, account_number, cci, currency, instructions, active,
  sort_order) on public.property_payment_accounts to authenticated;
grant all on public.property_payment_accounts to service_role;
grant usage on type public.payment_account_kind to authenticated, service_role;

-- ─── Guests (PII: members read, nobody else) ─────────────────────────────────
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200 and name = btrim(name)),
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) between 5 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_org_email_key unique (org_id, email),
  constraint guests_id_org_key unique (id, org_id)
);
create index guests_org_id_idx on public.guests(org_id);
create trigger guests_updated_at before update on public.guests
  for each row execute function private.touch_booking_updated_at();
alter table public.guests enable row level security;
create policy guests_select on public.guests for select to authenticated using (private.is_member(org_id));
revoke all on public.guests from public, anon, authenticated;
grant select on public.guests to authenticated;
grant all on public.guests to service_role;

-- ─── Quotes (server-computed snapshot; the token is the guest's capability) ──
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  token text not null check (char_length(token) >= 32),
  check_in date not null,
  check_out date not null,
  guests integer not null check (guests > 0),
  currency public.currency_code not null,
  total_cents integer not null check (total_cents >= 0),
  deposit_cents integer not null check (deposit_cents >= 0),
  breakdown jsonb not null default '{}' check (jsonb_typeof(breakdown) = 'object'),
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_token_key unique (token),
  constraint quotes_id_org_key unique (id, org_id),
  constraint quotes_unit_scope_fkey foreign key (unit_id, property_id, org_id)
    references public.units(id, property_id, org_id) on delete cascade,
  constraint quotes_dates_check check (isfinite(check_in) and isfinite(check_out) and check_out > check_in),
  constraint quotes_deposit_check check (deposit_cents <= total_cents),
  constraint quotes_expiry_check check (expires_at > created_at)
);
create index quotes_org_id_idx on public.quotes(org_id);
create index quotes_unit_id_idx on public.quotes(unit_id);
create trigger quotes_updated_at before update on public.quotes
  for each row execute function private.touch_booking_updated_at();
alter table public.quotes enable row level security;
create policy quotes_select on public.quotes for select to authenticated using (private.is_member(org_id));
-- No member write grants: the server writes quotes after running quoteStay (SD-402).
revoke all on public.quotes from public, anon, authenticated;
grant select on public.quotes to authenticated;
grant all on public.quotes to service_role;

-- ─── Bookings ────────────────────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  guest_id uuid not null,
  quote_id uuid not null,
  check_in date not null,
  check_out date not null,
  guests integer not null check (guests > 0),
  currency public.currency_code not null,
  total_cents integer not null check (total_cents >= 0),
  deposit_cents integer not null check (deposit_cents >= 0),
  status public.booking_status not null default 'pending_payment',
  expires_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- NO ACTION (not cascade) so a unit/guest/quote with bookings cannot be deleted; an
  -- organization delete still works because all its rows go in the same statement.
  constraint bookings_unit_scope_fkey foreign key (unit_id, property_id, org_id)
    references public.units(id, property_id, org_id) on delete no action,
  constraint bookings_guest_fkey foreign key (guest_id, org_id)
    references public.guests(id, org_id) on delete no action,
  constraint bookings_quote_fkey foreign key (quote_id, org_id)
    references public.quotes(id, org_id) on delete no action,
  constraint bookings_quote_key unique (quote_id), -- a quote becomes at most one booking
  constraint bookings_id_org_key unique (id, org_id),
  constraint bookings_id_org_currency_key unique (id, org_id, currency),
  constraint bookings_dates_check check (isfinite(check_in) and isfinite(check_out) and check_out > check_in),
  constraint bookings_deposit_check check (deposit_cents <= total_cents),
  constraint bookings_status_check check (
    case status
      when 'pending_payment' then expires_at is not null and confirmed_at is null and cancelled_at is null
      when 'confirmed' then expires_at is null and confirmed_at is not null and cancelled_at is null
      when 'cancelled' then cancelled_at is not null
      when 'expired' then cancelled_at is null and confirmed_at is null
    end
  )
);
create index bookings_org_id_idx on public.bookings(org_id);
create index bookings_unit_id_idx on public.bookings(unit_id);
create index bookings_guest_id_idx on public.bookings(guest_id);
create index bookings_hold_sweep_idx on public.bookings(expires_at) where status = 'pending_payment';
create trigger bookings_updated_at before update on public.bookings
  for each row execute function private.touch_booking_updated_at();
alter table public.bookings enable row level security;
create policy bookings_select on public.bookings for select to authenticated using (private.is_member(org_id));
revoke all on public.bookings from public, anon, authenticated;
grant select on public.bookings to authenticated;
grant all on public.bookings to service_role;
grant usage on type public.booking_status, public.currency_code to authenticated, service_role;

-- Defence in depth: even a privileged writer cannot rewrite what was agreed or reopen a
-- finished booking. Allowed: pending_payment -> confirmed|cancelled|expired, confirmed -> cancelled.
create function private.guard_booking_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.org_id, new.property_id, new.unit_id, new.guest_id, new.quote_id, new.check_in, new.check_out,
      new.guests, new.currency, new.total_cents, new.deposit_cents)
     is distinct from
     (old.org_id, old.property_id, old.unit_id, old.guest_id, old.quote_id, old.check_in, old.check_out,
      old.guests, old.currency, old.total_cents, old.deposit_cents) then
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
revoke all on function private.guard_booking_update() from public, anon, authenticated;
create trigger bookings_guard before update on public.bookings
  for each row execute function private.guard_booking_update();

-- ─── Payments ────────────────────────────────────────────────────────────────
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  booking_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  currency public.currency_code not null,
  method public.payment_method not null,
  status public.payment_status not null default 'pending_review',
  reference text check (reference is null or char_length(reference) between 1 and 200),
  voucher_path text check (voucher_path is null or char_length(voucher_path) between 1 and 500),
  reject_reason text check (reject_reason is null or char_length(reject_reason) between 1 and 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The currency is pinned to the booking's: a payment can never be in another currency.
  constraint payments_booking_fkey foreign key (booking_id, org_id, currency)
    references public.bookings(id, org_id, currency) on delete no action,
  constraint payments_id_org_key unique (id, org_id),
  constraint payments_review_check check (
    (status = 'pending_review') = (reviewed_at is null)
  )
);
create index payments_org_id_idx on public.payments(org_id);
create index payments_booking_id_idx on public.payments(booking_id);
-- One voucher under review per booking.
create unique index payments_one_pending_idx on public.payments(booking_id) where status = 'pending_review';
create trigger payments_updated_at before update on public.payments
  for each row execute function private.touch_booking_updated_at();
alter table public.payments enable row level security;
create policy payments_select on public.payments for select to authenticated using (private.is_member(org_id));
revoke all on public.payments from public, anon, authenticated;
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
grant usage on type public.payment_status, public.payment_method to authenticated, service_role;

create function private.guard_payment_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.org_id, new.booking_id, new.amount_cents, new.currency, new.method)
     is distinct from (old.org_id, old.booking_id, old.amount_cents, old.currency, old.method) then
    raise exception 'payment terms are immutable' using errcode = '55000';
  end if;
  if new.status <> old.status and not (old.status = 'pending_review' and new.status in ('approved', 'rejected')) then
    raise exception 'invalid payment transition % -> %', old.status, new.status using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_payment_update() from public, anon, authenticated;
create trigger payments_guard before update on public.payments
  for each row execute function private.guard_payment_update();

-- ─── Hold release ────────────────────────────────────────────────────────────
-- Expires pending_payment bookings whose hold ran out and frees their dates. Bookings with a
-- voucher under review are kept (the guest already paid; the owner decides). Rows locked by a
-- concurrent confirm/cancel are skipped (next sweep picks them up) so sweeps never deadlock.
-- Writers of payments (SD-405) must lock the booking row first, like the RPCs below.
create function private.release_expired_holds(p_unit_id uuid default null)
returns integer
language sql
security definer
set search_path = ''
as $$
  with due as (
    select b.id from public.bookings b
    where b.status = 'pending_payment' and b.expires_at <= now()
      and (p_unit_id is null or b.unit_id = p_unit_id)
      and not exists (select 1 from public.payments p where p.booking_id = b.id and p.status = 'pending_review')
    order by b.id
    for update skip locked
  ), expired as (
    update public.bookings b set status = 'expired', expires_at = null
    from due where b.id = due.id returning b.id
  ), freed as (
    delete from public.calendar_blocks cb
    using expired where cb.booking_id = expired.id and cb.source = 'booking' returning cb.id
  )
  select count(*)::integer from expired;
$$;
revoke all on function private.release_expired_holds(uuid) from public, anon, authenticated;

create function public.expire_holds()
returns integer
language sql
security definer
set search_path = ''
as $$ select private.release_expired_holds(null); $$;
revoke all on function public.expire_holds() from public, anon, authenticated;
grant execute on function public.expire_holds() to service_role; -- cron only

-- ─── create_booking_from_quote ───────────────────────────────────────────────
-- Idempotent per quote: replays return the existing booking whatever its status. Everything
-- (hold release, guest upsert, booking, block) commits or rolls back together; if the dates
-- are taken the exclusion constraint raises 23P01 and the guest upsert is rolled back too.
create function public.create_booking_from_quote(
  p_token text,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_guest_name);
  v_email text := lower(btrim(p_guest_email));
  v_phone text := nullif(btrim(p_guest_phone), '');
  q public.quotes%rowtype;
  b public.bookings%rowtype;
  v_unit public.units%rowtype;
  v_prop public.properties%rowtype;
  v_guest uuid;
  v_id uuid := gen_random_uuid();
  v_expires timestamptz;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 200 then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 200
     or v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or (v_phone is not null and (char_length(v_phone) not between 5 and 30 or v_phone !~ '^[0-9+() -]+$')) then
    raise exception 'invalid guest data' using errcode = '22023';
  end if;

  -- The quote row lock serialises concurrent calls for the same quote.
  select * into q from public.quotes where token = p_token for update;
  if not found then
    raise exception 'quote not found' using errcode = 'P0002';
  end if;

  select * into b from public.bookings where quote_id = q.id;
  if found then
    return jsonb_build_object('booking_id', b.id, 'status', b.status, 'expires_at', b.expires_at, 'replayed', true);
  end if;

  if q.expires_at <= now() then
    raise exception 'quote expired' using errcode = 'SD001';
  end if;
  select * into v_unit from public.units where id = q.unit_id and org_id = q.org_id and property_id = q.property_id;
  select * into v_prop from public.properties where id = q.property_id and org_id = q.org_id;
  if v_unit.id is null or v_prop.id is null or not v_unit.active or v_prop.currency <> q.currency
     or q.guests > v_unit.max_guests then
    raise exception 'quote is not bookable' using errcode = '22023';
  end if;

  perform private.release_expired_holds(q.unit_id);

  insert into public.guests (org_id, name, email, phone)
  values (q.org_id, v_name, v_email, v_phone)
  -- Existing guest data is never overwritten by an anonymous caller; only a missing phone is filled.
  on conflict (org_id, email) do update set phone = coalesce(public.guests.phone, excluded.phone)
  returning id into v_guest;

  v_expires := now() + make_interval(mins => v_prop.booking_hold_minutes);
  insert into public.bookings (id, org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out,
    guests, currency, total_cents, deposit_cents, status, expires_at)
  values (v_id, q.org_id, q.property_id, q.unit_id, v_guest, q.id, q.check_in, q.check_out,
    q.guests, q.currency, q.total_cents, q.deposit_cents, 'pending_payment', v_expires);

  insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id, expires_at)
  values (q.org_id, q.property_id, q.unit_id, daterange(q.check_in, q.check_out, '[)'), 'booking', v_id, v_expires);

  return jsonb_build_object('booking_id', v_id, 'status', 'pending_payment', 'expires_at', v_expires, 'replayed', false);
end;
$$;
revoke all on function public.create_booking_from_quote(text, text, text, text) from public;
grant execute on function public.create_booking_from_quote(text, text, text, text)
  to anon, authenticated, service_role;

-- ─── Owner/staff transitions ─────────────────────────────────────────────────
-- Lock order everywhere: booking row, then payment row.
create function public.confirm_payment(p_org_id uuid, p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
  b public.bookings%rowtype;
  p public.payments%rowtype;
begin
  if p_org_id is null or not private.is_member(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select booking_id into v_booking from public.payments where id = p_payment_id and org_id = p_org_id;
  if v_booking is null then
    raise exception 'payment not found' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = v_booking and org_id = p_org_id for update;
  select * into p from public.payments where id = p_payment_id and org_id = p_org_id for update;

  if p.status = 'approved' then -- idempotent replay
    return jsonb_build_object('booking_id', b.id, 'booking_status', b.status, 'replayed', true);
  end if;
  if p.status <> 'pending_review' or b.status <> 'pending_payment' then
    raise exception 'cannot confirm payment % of booking %', p.status, b.status using errcode = '55000';
  end if;
  if p.amount_cents < b.deposit_cents then
    raise exception 'payment is below the required deposit' using errcode = '22023';
  end if;

  update public.payments set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p.id;
  update public.bookings set status = 'confirmed', confirmed_at = now(), expires_at = null
    where id = b.id;
  update public.calendar_blocks set expires_at = null where booking_id = b.id and source = 'booking';
  return jsonb_build_object('booking_id', b.id, 'booking_status', 'confirmed', 'replayed', false);
end;
$$;

create function public.reject_payment(p_org_id uuid, p_payment_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
  v_reason text := nullif(btrim(p_reason), '');
  b public.bookings%rowtype;
  p public.payments%rowtype;
begin
  if p_org_id is null or not private.is_member(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'reason too long' using errcode = '22023';
  end if;
  select booking_id into v_booking from public.payments where id = p_payment_id and org_id = p_org_id;
  if v_booking is null then
    raise exception 'payment not found' using errcode = '42501';
  end if;
  select * into b from public.bookings where id = v_booking and org_id = p_org_id for update;
  select * into p from public.payments where id = p_payment_id and org_id = p_org_id for update;

  if p.status = 'rejected' then -- idempotent replay
    return jsonb_build_object('booking_id', b.id, 'booking_status', b.status, 'replayed', true);
  end if;
  if p.status <> 'pending_review' then
    raise exception 'cannot reject payment %', p.status using errcode = '55000';
  end if;
  -- The booking stays as it is: the guest may submit another voucher until the hold ends.
  update public.payments set status = 'rejected', reject_reason = v_reason, reviewed_by = auth.uid(),
    reviewed_at = now() where id = p.id;
  return jsonb_build_object('booking_id', b.id, 'booking_status', b.status, 'replayed', false);
end;
$$;

-- Refunds of approved payments are outside this ticket: approved payments are left untouched.
create function public.cancel_booking(p_org_id uuid, p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  b public.bookings%rowtype;
begin
  if p_org_id is null or not private.is_member(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'reason too long' using errcode = '22023';
  end if;
  select * into b from public.bookings where id = p_booking_id and org_id = p_org_id for update;
  if not found then
    raise exception 'booking not found' using errcode = '42501';
  end if;
  if b.status = 'cancelled' then -- idempotent replay
    return jsonb_build_object('booking_id', b.id, 'status', b.status, 'replayed', true);
  end if;
  if b.status not in ('pending_payment', 'confirmed') then
    raise exception 'cannot cancel a % booking', b.status using errcode = '55000';
  end if;

  update public.bookings set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason,
    expires_at = null where id = b.id;
  delete from public.calendar_blocks where booking_id = b.id and source = 'booking';
  update public.payments set status = 'rejected', reject_reason = 'booking cancelled',
    reviewed_by = auth.uid(), reviewed_at = now()
    where booking_id = b.id and status = 'pending_review';
  return jsonb_build_object('booking_id', b.id, 'status', 'cancelled', 'replayed', false);
end;
$$;

revoke all on function public.confirm_payment(uuid, uuid) from public, anon;
revoke all on function public.reject_payment(uuid, uuid, text) from public, anon;
revoke all on function public.cancel_booking(uuid, uuid, text) from public, anon;
grant execute on function public.confirm_payment(uuid, uuid), public.reject_payment(uuid, uuid, text),
  public.cancel_booking(uuid, uuid, text) to authenticated;
commit;
