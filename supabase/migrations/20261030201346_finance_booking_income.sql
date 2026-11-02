-- SD-807: automatic income from bookings and the iCal calendar (ADR 0007, 0008). Additive
-- migration: no table changes; it replaces one function signature and adds three functions.
-- Rollback (income already written stays in the ledger; delete it by hand if wanted):
--   drop function public.complete_ical_rental(uuid, uuid, integer, public.currency_code, date, numeric, integer, integer);
--   drop function public.list_ical_rentals_to_complete(uuid);
--   drop function private.ical_rental_ref(uuid, text);
--   drop function public.confirm_payment(uuid, uuid, numeric);
--   then recreate confirm_payment(uuid, uuid) from 20261029185857_booking_schema.sql.
--
-- Direct bookings
--  * confirm_payment writes the income of THAT payment in the same transaction that approves it:
--    finance_entries(source = 'booking', external_ref = payment id). Both happen or neither does.
--    Replays return before touching the ledger, and the unique (org_id, source, external_ref)
--    index is the last barrier, so a payment can never produce two incomes.
--  * The amount is the approved payment (what was really received), never the quote total.
--    The cash date is the Lima date the payment was registered (payments.created_at).
--  * created_by stays null: it is a system movement, so staff who approve a payment do not
--    gain access to ledger rows they did not write (staff only read what they created).
--  * Foreign currency needs an exchange rate and this schema has no external source (ADR 0007).
--    The caller may pass p_fx_rate_pen; otherwise the org's most recent rate for that currency
--    in its ledger is used (the same figure the forms prefill). With neither, the confirmation
--    is refused with 22023 BEFORE any change, so the owner enters the rate and retries.
--  * Cancelling a confirmed booking keeps its income: refunds are outside this ticket
--    (cancel_booking leaves approved payments untouched), so the cash received stays recorded.
--
-- iCal (Airbnb / Booking)
--  * A feed only carries dates. Nothing is ever written from it automatically and no amount is
--    inferred: list_ical_rentals_to_complete lists the imported stays that already started and have
--    no income, and complete_ical_rental records the amount the OWNER types (+ optional cleaning).
--  * Idempotency key: external_ref = 'ical:' || sha256(feed id || ':' || hashed event uid), derived
--    here. The key is stable across re-syncs (calendar_blocks keeps feed_id + external_uid), and
--    neither the uid nor its hash is returned to the client: the block id is the handle.
--  * A stay is "done" when an income with that key exists OR any income of the same unit has the
--    same stay dates (a rental typed by hand), so it is never offered twice.
-- Errors: 42501 not allowed / not found in that org · 22023 invalid input · 55000 state.

begin;

-- ─── confirm_payment: approve + record the income atomically ─────────────────
-- The signature gains an optional rate, so the old two-argument function is replaced (a call with
-- two arguments, positional or named, still resolves to the new one).
drop function public.confirm_payment(uuid, uuid);

create function public.confirm_payment(p_org_id uuid, p_payment_id uuid, p_fx_rate_pen numeric default null)
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
  if p_org_id is null or not private.is_member(p_org_id) then
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
revoke all on function public.confirm_payment(uuid, uuid, numeric) from public, anon;
grant execute on function public.confirm_payment(uuid, uuid, numeric) to authenticated;

-- ─── iCal: stable, opaque key of an imported stay ────────────────────────────
create function private.ical_rental_ref(p_feed_id uuid, p_external_uid text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'ical:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_feed_id::text || ':' || p_external_uid, 'UTF8')), 'hex');
$$;
-- Callable by the invoker-rights list function; it only hashes values the caller can already read.
revoke all on function private.ical_rental_ref(uuid, text) from public, anon;
grant execute on function private.ical_rental_ref(uuid, text) to authenticated;

-- ─── iCal: stays waiting for an income (owner only) ──────────────────────────
-- SECURITY INVOKER: RLS still applies (ical_feeds and finance_entries are owner-only), the explicit
-- check just turns a staff call into a clear refusal. Only Airbnb/Booking stays that already
-- started are listed; the uid never leaves the database.
create function public.list_ical_rentals_to_complete(p_org_id uuid)
returns table (
  block_id uuid,
  unit_id uuid,
  unit_name text,
  channel text,
  stay_start date,
  stay_end date,
  suggested_cleaning_cents integer,
  currency public.currency_code
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_org_id is null or not coalesce(private.is_owner(p_org_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select b.id, b.unit_id, u.name, f.channel::text, lower(b.period), upper(b.period),
         s.cleaning_cost_cents, pr.currency
    from public.calendar_blocks b
    join public.ical_feeds f on f.id = b.feed_id and f.org_id = b.org_id
    join public.units u on u.id = b.unit_id and u.org_id = b.org_id
    join public.properties pr on pr.id = b.property_id and pr.org_id = b.org_id
    left join public.finance_unit_settings s on s.unit_id = b.unit_id and s.org_id = b.org_id
   where b.org_id = p_org_id
     and b.source = 'ical'
     and f.channel in ('airbnb', 'booking')
     and lower(b.period) <= (now() at time zone 'America/Lima')::date
     and not exists (
       select 1 from public.finance_entries e
        where e.org_id = b.org_id and e.kind = 'income'
          and ((e.source = 'ical' and e.external_ref = private.ical_rental_ref(b.feed_id, b.external_uid))
               or (e.unit_id = b.unit_id and e.stay_start = lower(b.period) and e.stay_end = upper(b.period))))
   order by lower(b.period) desc, b.id
   limit 200;
end;
$$;
revoke all on function public.list_ical_rentals_to_complete(uuid) from public, anon;
grant execute on function public.list_ical_rentals_to_complete(uuid) to authenticated;

-- ─── iCal: record the owner's amount for an imported stay ────────────────────
-- Idempotent and race-safe: the rental carries the stay key, so the second call (a double click,
-- another tab, a re-sync in between) finds it and returns it with replayed = true, and the cleaning is
-- only written together with a rental that was actually inserted.
create function public.complete_ical_rental(
  p_org_id uuid,
  p_block_id uuid,
  p_amount_cents integer,
  p_currency public.currency_code,
  p_occurred_on date,
  p_fx_rate_pen numeric default null,
  p_guests integer default null,
  p_cleaning_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.calendar_blocks%rowtype;
  v_channel public.ical_channel;
  v_ref text;
  v_category uuid;
  v_rental uuid;
begin
  if p_org_id is null or not coalesce(private.is_owner(p_org_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into b from public.calendar_blocks cb
   where cb.id = p_block_id and cb.org_id = p_org_id and cb.source = 'ical' for update;
  if not found then
    raise exception 'stay not found' using errcode = '42501';
  end if;
  select f.channel into v_channel from public.ical_feeds f where f.id = b.feed_id and f.org_id = b.org_id;
  if v_channel is null or v_channel not in ('airbnb', 'booking') then
    raise exception 'stay not found' using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 or p_currency is null
     or p_occurred_on is null or not isfinite(p_occurred_on)
     or (p_currency = 'PEN' and p_fx_rate_pen is not null)
     or (p_currency <> 'PEN' and (p_fx_rate_pen is null or p_fx_rate_pen <= 0 or p_fx_rate_pen >= 100))
     or (p_guests is not null and p_guests not between 1 and 1000)
     or (p_cleaning_cents is not null and p_cleaning_cents < 0) then
    raise exception 'invalid input' using errcode = '22023';
  end if;

  v_ref := private.ical_rental_ref(b.feed_id, b.external_uid);
  select e.id into v_rental from public.finance_entries e
   where e.org_id = b.org_id and e.kind = 'income'
     and ((e.source = 'ical' and e.external_ref = v_ref)
          or (e.unit_id = b.unit_id and e.stay_start = lower(b.period) and e.stay_end = upper(b.period)))
   order by e.created_at, e.id limit 1;
  if v_rental is not null then
    return jsonb_build_object('rental_id', v_rental, 'replayed', true);
  end if;

  perform private.seed_finance_categories(b.org_id);
  select c.id into v_category from public.finance_categories c where c.org_id = b.org_id and c.system_key = 'rental';
  if v_category is null then
    raise exception 'rental category missing' using errcode = '55000';
  end if;
  insert into public.finance_entries (
    org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id, payment_method,
    stay_start, stay_end, channel, guests, source, external_ref
  ) values (
    b.org_id, 'income', v_category, p_occurred_on, p_amount_cents, p_currency, p_fx_rate_pen, b.unit_id, 'platform',
    lower(b.period), upper(b.period), v_channel::text::public.finance_channel, p_guests, 'ical', v_ref
  ) on conflict (org_id, source, external_ref) where external_ref is not null do nothing
  returning id into v_rental;

  if v_rental is null then -- lost a race with a concurrent call: it owns the rental and its cleaning
    select e.id into v_rental from public.finance_entries e
     where e.org_id = b.org_id and e.source = 'ical' and e.external_ref = v_ref;
    return jsonb_build_object('rental_id', v_rental, 'replayed', true);
  end if;

  if coalesce(p_cleaning_cents, 0) > 0 then
    select c.id into v_category from public.finance_categories c where c.org_id = b.org_id and c.system_key = 'cleaning';
    if v_category is null then
      raise exception 'cleaning category missing' using errcode = '55000';
    end if;
    insert into public.finance_entries (
      org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id, related_entry_id,
      source, external_ref
    ) values (
      b.org_id, 'expense', v_category, upper(b.period), p_cleaning_cents, p_currency, p_fx_rate_pen, b.unit_id,
      v_rental, 'ical', v_ref || ':cleaning'
    ) on conflict (org_id, source, external_ref) where external_ref is not null do nothing;
  end if;

  return jsonb_build_object('rental_id', v_rental, 'replayed', false);
end;
$$;
revoke all on function public.complete_ical_rental(uuid, uuid, integer, public.currency_code, date, numeric, integer, integer)
  from public, anon;
grant execute on function public.complete_ical_rental(uuid, uuid, integer, public.currency_code, date, numeric, integer, integer)
  to authenticated;

commit;
