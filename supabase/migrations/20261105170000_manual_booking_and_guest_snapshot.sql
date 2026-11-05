-- SD-413 (parts 2-3): guest snapshot on the booking, owner-registered manual bookings and payments.
--  * bookings.guest_name / guest_phone keep what the guest typed in the checkout (H4 of the SD-403 review). create_booking_from_quote
--    no longer fills the phone of an EXISTING guest from anonymous input, so a stranger cannot rewrite a guest's contact data.
--  * create_manual_booking: OWNER ONLY. The price is computed by private.price_stay (never sent by the client); availability is the
--    exclusion constraint on calendar_blocks (23P01). The booking starts pending_payment with the property's hold, like a web booking.
--  * record_manual_payment: OWNER ONLY. Cash/Yape/transfer received outside the site, as the deposit (confirms the booking through
--    confirm_payment) or as the balance of a confirmed booking (never above the total). Writes the ledger income like confirm_payment.
-- Rollback: drop both functions; re-run create_booking_from_quote from 20261101233822; alter table bookings drop column guest_name, drop column guest_phone.
begin;

alter table public.bookings
  add column guest_name text check (guest_name is null or char_length(guest_name) between 1 and 200),
  add column guest_phone text check (guest_phone is null or char_length(guest_phone) between 5 and 30);

create or replace function public.create_booking_from_quote(
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
  -- Same accepted edge spaces as JavaScript trim(); Cc/Cf/Zl/Zp are rejected raw below.
  v_name text := btrim(p_guest_name, U&'\0020\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\202f\205f\3000');
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
  -- Explicit Unicode Cc/Cf/Zl/Zp ranges, checked BEFORE trimming. PostgreSQL text
  -- cannot contain NUL: the input/encoding layer rejects it before the RPC.
  if p_guest_name ~ U&'[\0001-\001f\007f-\009f\00ad\0600-\0605\061c\06dd\070f\0890-\0891\08e2\180e\200b-\200f\2028-\2029\202a-\202e\2060-\2064\2066-\206f\feff\fff9-\fffb\+0110bd\+0110cd\+013430-\+01343f\+01bca0-\+01bca3\+01d173-\+01d17a\+0e0001\+0e0020-\+0e007f]' then
    raise exception 'invalid guest data' using errcode = '22023';
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
    return jsonb_build_object('booking_id', b.id, 'status', b.status, 'expires_at', b.expires_at, 'replayed', true, 'public_token', b.public_token);
  end if;

  if q.expires_at <= now() then
    raise exception 'quote expired' using errcode = 'SD001';
  end if;
  select * into v_unit from public.units where id = q.unit_id and org_id = q.org_id and property_id = q.property_id;
  select * into v_prop from public.properties where id = q.property_id and org_id = q.org_id;
  if v_unit.id is null or v_prop.id is null or not v_unit.active or not v_prop.published or v_prop.currency <> q.currency
     or q.guests > v_unit.max_guests then
    raise exception 'quote is not bookable' using errcode = '22023';
  end if;

  perform private.release_expired_holds(q.unit_id);

  insert into public.guests (org_id, name, email, phone)
  values (q.org_id, v_name, v_email, v_phone)
  -- Existing guest data is never overwritten by an anonymous caller (SD-413: not even a missing phone). What was typed in the
  -- checkout is kept on the booking as a snapshot instead.
  on conflict (org_id, email) do update set email = excluded.email
  returning id into v_guest;

  v_expires := now() + make_interval(mins => v_prop.booking_hold_minutes);
  insert into public.bookings (id, org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out,
    guests, currency, total_cents, deposit_cents, status, expires_at, guest_name, guest_phone)
  values (v_id, q.org_id, q.property_id, q.unit_id, v_guest, q.id, q.check_in, q.check_out,
    q.guests, q.currency, q.total_cents, q.deposit_cents, 'pending_payment', v_expires, v_name, v_phone);

  insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id, expires_at)
  values (q.org_id, q.property_id, q.unit_id, daterange(q.check_in, q.check_out, '[)'), 'booking', v_id, v_expires);

  return jsonb_build_object('booking_id', v_id, 'status', 'pending_payment', 'expires_at', v_expires, 'replayed', false,
    'public_token', (select public_token from public.bookings where id = v_id));
end;
$$;

create function public.create_manual_booking(
  p_org_id uuid, p_unit_id uuid, p_check_in date, p_check_out date, p_guests integer,
  p_guest_name text, p_guest_email text, p_guest_phone text default null, p_lang text default 'es'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(p_guest_name);
  v_email text := lower(btrim(p_guest_email));
  v_phone text := nullif(btrim(p_guest_phone), '');
  v_today date := (now() at time zone 'America/Lima')::date;
  priced jsonb; v_guest uuid; v_quote uuid; v_id uuid := gen_random_uuid(); v_expires timestamptz; v_hold integer;
  v_prev text := current_setting('saywa.booking_lang', true);
begin
  if p_org_id is null or not private.is_owner(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_unit_id is null or p_check_in is null or p_check_out is null or p_guests is null or p_lang is null or p_lang not in ('es','en')
     or p_guest_name ~ U&'[\0001-\001f\007f-\009f\00ad\200b-\200f\2028-\202e\2060-\2064\2066-\206f\feff]'
     or v_name is null or char_length(v_name) not between 1 and 200
     or v_email is null or char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or (v_phone is not null and (char_length(v_phone) not between 5 and 30 or v_phone !~ '^[0-9+() -]+$'))
     or p_check_out <= p_check_in or p_check_in < v_today - 1 or p_check_out - p_check_in > 90 or p_check_out > v_today + 731 then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  priced := private.price_stay(p_unit_id, p_check_in, p_check_out, p_guests);
  if not (priced ->> 'ok')::boolean then return priced; end if;
  if (priced ->> 'orgId')::uuid is distinct from p_org_id then
    raise exception 'not allowed' using errcode = '42501'; -- the unit belongs to another organization
  end if;

  perform private.release_expired_holds(p_unit_id);
  select booking_hold_minutes into v_hold from public.properties where id = (priced ->> 'propertyId')::uuid and org_id = p_org_id;
  v_expires := now() + make_interval(mins => coalesce(v_hold, 120));

  insert into public.quotes (org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
    total_cents, deposit_cents, breakdown, expires_at, created_by, is_public)
  values (p_org_id, (priced ->> 'propertyId')::uuid, p_unit_id, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    p_check_in, p_check_out, p_guests, (priced ->> 'currency')::public.currency_code, (priced ->> 'totalCents')::integer,
    (priced ->> 'depositCents')::integer, priced -> 'breakdown', now(), auth.uid(), false)
  returning id into v_quote;

  insert into public.guests (org_id, name, email, phone) values (p_org_id, v_name, v_email, v_phone)
  on conflict (org_id, email) do update set email = excluded.email returning id into v_guest;

  perform set_config('saywa.booking_lang', p_lang, true);
  insert into public.bookings (id, org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out, guests, currency,
    total_cents, deposit_cents, status, expires_at, guest_name, guest_phone)
  values (v_id, p_org_id, (priced ->> 'propertyId')::uuid, p_unit_id, v_guest, v_quote, p_check_in, p_check_out, p_guests,
    (priced ->> 'currency')::public.currency_code, (priced ->> 'totalCents')::integer, (priced ->> 'depositCents')::integer,
    'pending_payment', v_expires, v_name, v_phone);
  perform set_config('saywa.booking_lang', coalesce(v_prev, ''), true);

  -- The exclusion constraint is the authority on double booking: 23P01 when the dates are taken.
  insert into public.calendar_blocks (org_id, property_id, unit_id, period, source, booking_id, expires_at)
  values (p_org_id, (priced ->> 'propertyId')::uuid, p_unit_id, daterange(p_check_in, p_check_out, '[)'), 'booking', v_id, v_expires);

  return jsonb_build_object('ok', true, 'booking_id', v_id, 'expires_at', v_expires,
    'total_cents', (priced ->> 'totalCents')::integer, 'deposit_cents', (priced ->> 'depositCents')::integer,
    'currency', priced ->> 'currency');
end;
$$;

create function public.record_manual_payment(
  p_org_id uuid, p_booking_id uuid, p_amount_cents integer, p_method public.payment_method,
  p_reference text default null, p_fx_rate_pen numeric default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype; v_paid bigint; v_id uuid := gen_random_uuid(); v_ref text := nullif(btrim(p_reference), '');
  v_fx numeric; v_category uuid; v_guest text;
begin
  if p_org_id is null or not private.is_owner(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_booking_id is null or p_amount_cents is null or p_amount_cents < 1 or p_method is null
     or p_method = 'mercado_pago' or (v_ref is not null and char_length(v_ref) > 200) then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  select * into b from public.bookings where id = p_booking_id and org_id = p_org_id for update; -- lock order: booking, then payments
  if not found then
    raise exception 'booking not found' using errcode = '42501';
  end if;
  if b.status not in ('pending_payment', 'confirmed') then
    raise exception 'cannot register a payment on a % booking', b.status using errcode = '55000';
  end if;
  select coalesce(sum(amount_cents), 0) into v_paid from public.payments where booking_id = b.id and status = 'approved';
  if v_paid + p_amount_cents > b.total_cents then
    raise exception 'payment exceeds the total' using errcode = '22023';
  end if;

  if b.status = 'pending_payment' then
    -- The deposit: same rules and ledger entry as approving a guest's voucher. A voucher under review must be reviewed, not bypassed.
    if exists (select 1 from public.payments where booking_id = b.id and status = 'pending_review') then
      raise exception 'a voucher is under review' using errcode = '55000';
    end if;
    insert into public.payments (id, org_id, booking_id, amount_cents, currency, method, status, reference)
    values (v_id, p_org_id, b.id, p_amount_cents, b.currency, p_method, 'pending_review', v_ref);
    perform public.confirm_payment(p_org_id, v_id, p_fx_rate_pen);
    return jsonb_build_object('ok', true, 'payment_id', v_id, 'booking_status', 'confirmed');
  end if;

  -- The balance of a confirmed booking.
  if b.currency = 'PEN' then
    v_fx := null;
  else
    v_fx := coalesce(p_fx_rate_pen, (select e.fx_rate_pen from public.finance_entries e
      where e.org_id = p_org_id and e.currency = b.currency and e.fx_rate_pen is not null order by e.created_at desc, e.id desc limit 1));
    if v_fx is null or v_fx <= 0 or v_fx >= 100 then
      raise exception 'exchange rate required' using errcode = '22023';
    end if;
  end if;
  perform private.seed_finance_categories(p_org_id);
  select c.id into v_category from public.finance_categories c where c.org_id = p_org_id and c.system_key = 'rental';
  if v_category is null then
    raise exception 'rental category missing' using errcode = '55000';
  end if;
  select g.name into v_guest from public.guests g where g.id = b.guest_id and g.org_id = b.org_id;
  insert into public.payments (id, org_id, booking_id, amount_cents, currency, method, status, reference, reviewed_by, reviewed_at)
  values (v_id, p_org_id, b.id, p_amount_cents, b.currency, p_method, 'approved', v_ref, auth.uid(), now());
  insert into public.finance_entries (org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id, payment_method,
    counterparty, stay_start, stay_end, channel, guests, created_by, source, external_ref)
  values (b.org_id, 'income', v_category, (now() at time zone 'America/Lima')::date, p_amount_cents, b.currency, v_fx, b.unit_id,
    case p_method when 'yape' then 'yape_plin' when 'plin' then 'yape_plin' when 'bank_transfer' then 'bank_transfer'
      when 'cash' then 'cash' else 'other' end::public.finance_payment_method,
    v_guest, b.check_in, b.check_out, 'direct', case when b.guests <= 1000 then b.guests end, null, 'booking', v_id::text);
  return jsonb_build_object('ok', true, 'payment_id', v_id, 'booking_status', 'confirmed');
end;
$$;

revoke all on function public.create_manual_booking(uuid,uuid,date,date,integer,text,text,text,text) from public, anon;
revoke all on function public.record_manual_payment(uuid,uuid,integer,public.payment_method,text,numeric) from public, anon;
grant execute on function public.create_manual_booking(uuid,uuid,date,date,integer,text,text,text,text) to authenticated;
grant execute on function public.record_manual_payment(uuid,uuid,integer,public.payment_method,text,numeric) to authenticated;

commit;
