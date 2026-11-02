-- SD-403: closed public checkout snapshot and additive booking capability response.
-- No tables, RLS or booking locks change. New conversions require a published
-- property; raw guest names reject Unicode control/format characters. The publication check follows replay.
-- Rollback: drop get_quote_checkout(text,text); restore create_booking_from_quote
-- from 20261029185857 (removes the public_token response field and these input/publication guards).
begin;
create function public.get_quote_checkout(p_host text, p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when b.id is not null then
    jsonb_build_object('public_token', b.public_token)
  else jsonb_build_object(
    'property_name', p.name, 'unit_name', u.name,
    'check_in', q.check_in, 'check_out', q.check_out, 'guests', q.guests,
    'currency', q.currency, 'total_cents', q.total_cents, 'deposit_cents', q.deposit_cents,
    'balance_cents', q.total_cents - q.deposit_cents,
    'expires_at', q.expires_at, 'hold_minutes', p.booking_hold_minutes)
  end
  from public.quotes q
  join public.properties p on p.id = q.property_id and p.org_id = q.org_id
  join public.units u on u.id = q.unit_id and u.property_id = p.id and u.org_id = q.org_id
  left join public.bookings b on b.quote_id = q.id and b.org_id = q.org_id
  where p_token ~ '^[a-f0-9]{64}$' and q.token = p_token
    and p.published and nullif(lower(p_host), '') in (p.subdomain, p.custom_domain)
    -- A converted quote always leads to its booking, even after quote expiry.
    and (b.id is not null or q.expires_at > now())
$$;
revoke all on function public.get_quote_checkout(text, text) from public, anon, authenticated, service_role;
grant execute on function public.get_quote_checkout(text, text) to anon, authenticated;

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

  return jsonb_build_object('booking_id', v_id, 'status', 'pending_payment', 'expires_at', v_expires, 'replayed', false,
    'public_token', (select public_token from public.bookings where id = v_id));
end;
$$;
revoke all on function public.create_booking_from_quote(text, text, text, text) from public;
grant execute on function public.create_booking_from_quote(text, text, text, text)
  to anon, authenticated, service_role;


commit;
