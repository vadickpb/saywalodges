-- SD-413 (part 1): approving/rejecting a payment and cancelling a booking are owner-only IN THE DATABASE.
-- A `staff` member could otherwise call these RPCs with their own session (the UI hiding the buttons is not a control).
-- Same bodies as 20261030201346 (confirm_payment) and 20261029185857 (reject_payment, cancel_booking); the only change is
-- `private.is_member` -> `private.is_owner` in the permission check. Signatures, grants and errors are unchanged.
-- Rollback: re-run those definitions with `private.is_member`.
begin;

create or replace function public.confirm_payment(p_org_id uuid, p_payment_id uuid, p_fx_rate_pen numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
  v_fx numeric;
  v_category uuid;
  v_guest text;
  b public.bookings%rowtype;
  p public.payments%rowtype;
begin
  if p_org_id is null or not private.is_owner(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select booking_id into v_booking from public.payments where id = p_payment_id and org_id = p_org_id;
  if v_booking is null then
    raise exception 'payment not found' using errcode = '42501';
  end if;
  -- Lock order everywhere: booking row, then payment row.
  select * into b from public.bookings where id = v_booking and org_id = p_org_id for update;
  select * into p from public.payments where id = p_payment_id and org_id = p_org_id for update;

  if p.status = 'approved' then -- idempotent replay: the income was written the first time
    return jsonb_build_object('booking_id', b.id, 'booking_status', b.status, 'replayed', true);
  end if;
  if p.status <> 'pending_review' or b.status <> 'pending_payment' then
    raise exception 'cannot confirm payment % of booking %', p.status, b.status using errcode = '55000';
  end if;
  if p.amount_cents < b.deposit_cents then
    raise exception 'payment is below the required deposit' using errcode = '22023';
  end if;

  if p.currency = 'PEN' then
    v_fx := null; -- the ledger forbids a rate on soles
  else
    v_fx := coalesce(p_fx_rate_pen, (
      select e.fx_rate_pen from public.finance_entries e
       where e.org_id = p_org_id and e.currency = p.currency and e.fx_rate_pen is not null
       order by e.created_at desc, e.id desc limit 1));
    if v_fx is null or v_fx <= 0 or v_fx >= 100 then
      raise exception 'exchange rate required' using errcode = '22023';
    end if;
  end if;

  perform private.seed_finance_categories(p_org_id); -- idempotent; guarantees the built-in rental category
  select c.id into v_category from public.finance_categories c
   where c.org_id = p_org_id and c.system_key = 'rental';
  if v_category is null then
    raise exception 'rental category missing' using errcode = '55000';
  end if;
  select g.name into v_guest from public.guests g where g.id = b.guest_id and g.org_id = b.org_id;

  update public.payments set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    where id = p.id;
  update public.bookings set status = 'confirmed', confirmed_at = now(), expires_at = null
    where id = b.id;
  update public.calendar_blocks set expires_at = null where booking_id = b.id and source = 'booking';

  insert into public.finance_entries (
    org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id, payment_method,
    counterparty, stay_start, stay_end, channel, guests, created_by, source, external_ref
  ) values (
    b.org_id, 'income', v_category, (p.created_at at time zone 'America/Lima')::date, p.amount_cents, p.currency,
    v_fx, b.unit_id,
    case p.method
      when 'yape' then 'yape_plin' when 'plin' then 'yape_plin' when 'bank_transfer' then 'bank_transfer'
      when 'cash' then 'cash' else 'other' end::public.finance_payment_method,
    v_guest, b.check_in, b.check_out, 'direct', case when b.guests <= 1000 then b.guests end, null, 'booking', p.id::text
  ) on conflict (org_id, source, external_ref) where external_ref is not null do nothing;

  return jsonb_build_object('booking_id', b.id, 'booking_status', 'confirmed', 'replayed', false);
end;
$$;

create or replace function public.reject_payment(p_org_id uuid, p_payment_id uuid, p_reason text default null)
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
  if p_org_id is null or not private.is_owner(p_org_id) then
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

create or replace function public.cancel_booking(p_org_id uuid, p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  b public.bookings%rowtype;
begin
  if p_org_id is null or not private.is_owner(p_org_id) then
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

commit;
