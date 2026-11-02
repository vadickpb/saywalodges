-- SD-405: manual payment with voucher upload (Yape / Plin / transfer).
-- Rollback: drop function public.submit_payment_voucher(text, text, text, public.payment_method, text),
--   public.get_booking_payment_info(text, text), private.voucher_upload_allowed(text);
--   drop policy "payment_vouchers_insert" on storage.objects; drop policy "payment_vouchers_select" on storage.objects;
--   drop index public.payments_voucher_path_key; delete from storage.buckets where id = 'payment-vouchers' (after emptying it).
--
-- Trust model (H2 of the SD-403 security review: the booking's public_token reaches anyone with the quote link, so it must
-- not be enough on its own to do harm or to read anything lasting)
--  * What public_token can do, and for how long: while the booking is `pending_payment` and the hold has not run out, it can
--    (a) read the deposit amount and the property's ACTIVE payment accounts in the booking's currency (information the lodging
--    gives to anyone who is about to pay), and (b) upload up to 5 voucher files and register ONE voucher under review. Once the
--    booking is paid, expired, cancelled, or a voucher is already under review, it can do none of that.
--  * It can never read a voucher back: the bucket is private and only members of the booking's organization may select from it
--    (short-lived signed URLs, SD-406).
--  * Files are immutable evidence: nobody can update or delete them through the API.
--  * Object path: `<org_id>/<public_token>/<uuid>.<jpg|png|webp|pdf>`. The upload policy accepts only that shape, only for a
--    booking that is payable right now, and caps the number of files per booking. The RPC re-checks that the path belongs to THIS
--    booking and that the file exists, then creates the payment with the amount taken from the booking (never from the client).
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-vouchers', 'payment-vouchers', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A stored voucher belongs to one payment, once.
create unique index payments_voucher_path_key on public.payments(voucher_path) where voucher_path is not null;

-- ─── Who may upload a file right now ────────────────────────────────────────
-- SECURITY DEFINER because the caller (anon) has no table access to bookings. Pure yes/no: it leaks nothing.
create function private.voucher_upload_allowed(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);
  v_org uuid;
  v_token text;
begin
  if array_length(folders, 1) is distinct from 2 then return false; end if;
  if folders[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or folders[2] !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  if storage.filename(object_name) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$' then
    return false;
  end if;
  v_org := folders[1]::uuid;
  v_token := folders[2];

  return exists (
    select 1
    from public.bookings b
    join public.properties p on p.id = b.property_id and p.org_id = b.org_id
    where b.org_id = v_org and b.public_token = v_token
      and b.status = 'pending_payment' and b.expires_at > now() and p.published
      and not exists (select 1 from public.payments y where y.booking_id = b.id and y.status = 'pending_review')
  )
  -- At most 5 files per booking (counted before this insert), so the token cannot be used to fill the bucket.
  and (select count(*) from storage.objects o
        where o.bucket_id = 'payment-vouchers' and o.name like v_org::text || '/' || v_token || '/%') < 5;
end;
$$;
revoke all on function private.voucher_upload_allowed(text) from public;
grant execute on function private.voucher_upload_allowed(text) to anon, authenticated;

-- No update or delete policy on purpose: vouchers are immutable evidence.
create policy "payment_vouchers_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'payment-vouchers' and private.voucher_upload_allowed(name));

create policy "payment_vouchers_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'payment-vouchers' and private.is_member(private.storage_path_org(name)));

-- ─── What the guest sees while paying ───────────────────────────────────────
-- NULL (the page shows nothing) unless the booking is payable right now: pending_payment, hold not run out, no voucher
-- under review. Same host scoping and published check as get_booking_status.
create function public.get_booking_payment_info(p_host text, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'deposit_cents', b.deposit_cents,
    'currency', b.currency,
    'upload_prefix', b.org_id::text || '/' || b.public_token || '/',
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', a.kind, 'holder_name', a.holder_name, 'phone', a.phone, 'bank_name', a.bank_name,
               'account_number', a.account_number, 'cci', a.cci, 'instructions', a.instructions)
             order by a.sort_order, a.created_at)
      from public.property_payment_accounts a
      where a.org_id = b.org_id and a.property_id = b.property_id and a.active and a.currency = b.currency), '[]'::jsonb)
  )
  from public.bookings b
  join public.properties p on p.id = b.property_id and p.org_id = b.org_id
  where p_token ~ '^[a-f0-9]{64}$'
    and b.public_token = p_token
    and p.published
    and nullif(lower(p_host), '') in (p.subdomain, p.custom_domain)
    and b.status = 'pending_payment' and b.expires_at > now()
    and not exists (select 1 from public.payments y where y.booking_id = b.id and y.status = 'pending_review')
$$;
revoke all on function public.get_booking_payment_info(text, text) from public;
grant execute on function public.get_booking_payment_info(text, text) to anon, authenticated, service_role;

-- ─── Registering the uploaded voucher ───────────────────────────────────────
-- Errors: 22023 invalid input · P0002 booking or file not found · 55000 booking not payable / too many attempts ·
--         23505 a voucher is already under review.
create function public.submit_payment_voucher(
  p_host text, p_token text, p_voucher_path text, p_method public.payment_method, p_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings%rowtype;
  v_ref text := nullif(btrim(p_reference), '');
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_voucher_path is null or p_method is null then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  -- Only what a guest can actually pay with here; Mercado Pago has its own flow and cash is registered by the owner.
  if p_method not in ('yape', 'plin', 'bank_transfer') then
    raise exception 'invalid payment method' using errcode = '22023';
  end if;
  if v_ref is not null and (char_length(v_ref) > 200 or v_ref ~ '[[:cntrl:]]') then
    raise exception 'invalid reference' using errcode = '22023';
  end if;

  -- Row lock: the hold-expiry sweep skips locked rows, so the booking cannot expire between the checks and the insert.
  select bk.* into b
  from public.bookings bk
  join public.properties p on p.id = bk.property_id and p.org_id = bk.org_id
  where bk.public_token = p_token and p.published and nullif(lower(p_host), '') in (p.subdomain, p.custom_domain)
  for update of bk;
  if not found then raise exception 'booking not found' using errcode = 'P0002'; end if;

  if b.status <> 'pending_payment' or b.expires_at <= now() then
    raise exception 'booking not payable' using errcode = '55000';
  end if;
  -- The file must be under THIS booking's own folder and must really exist (the upload policy already restricted who put it there).
  if p_voucher_path !~ ('^' || b.org_id::text || '/' || b.public_token || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$') then
    raise exception 'invalid voucher path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'payment-vouchers' and o.name = p_voucher_path) then
    raise exception 'voucher file not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.payments y where y.booking_id = b.id and y.status = 'pending_review') then
    raise exception 'a voucher is already under review' using errcode = '23505';
  end if;
  if (select count(*) from public.payments y where y.booking_id = b.id) >= 5 then
    raise exception 'too many voucher attempts' using errcode = '55000';
  end if;

  insert into public.payments (org_id, booking_id, amount_cents, currency, method, reference, voucher_path)
  values (b.org_id, b.id, b.deposit_cents, b.currency, p_method, v_ref, p_voucher_path);

  return jsonb_build_object('voucher', 'under_review');
end;
$$;
revoke all on function public.submit_payment_voucher(text, text, text, public.payment_method, text) from public;
grant execute on function public.submit_payment_voucher(text, text, text, public.payment_method, text) to anon, authenticated, service_role;

commit;
