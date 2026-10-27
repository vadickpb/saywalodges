-- SD-803: register a rental together with its platform commission and cleaning
-- cost as ONE atomic operation (ADR 0007). Additive migration.
-- Rollback: drop function public.create_rental_entries(uuid, uuid, date, date, public.finance_channel, date, integer,
--   public.currency_code, integer, text, numeric, public.finance_payment_method, text, text, integer, integer);
--
-- SECURITY INVOKER on purpose: it runs with the caller's rights, so the table
-- RLS, column grants and the related_entry guard trigger from SD-801 decide
-- what is allowed (an owner or a staff member of the unit's org; nobody else).
-- p_org_id is the session's org and must equal the unit's org (42501 otherwise). If the
-- caller cannot see the unit or write into its org, the first insert fails with
-- 42501 and nothing is written.
--
-- Commission and cleaning share the rental's currency and exchange rate: one
-- registration, one rate. They are linked to the rental (related_entry_id) so
-- reports can show profit per stay.

create function public.create_rental_entries(
  p_org_id uuid,
  p_unit_id uuid,
  p_stay_start date,
  p_stay_end date,
  p_channel public.finance_channel,
  p_occurred_on date,
  p_amount_cents integer,
  p_currency public.currency_code,
  -- Optional (default null) so API clients can omit them; call with named arguments.
  p_guests integer default null,
  p_guest_name text default null,
  p_fx_rate_pen numeric default null,
  p_payment_method public.finance_payment_method default null,
  p_receipt_path text default null,
  p_note text default null,
  p_commission_cents integer default null,
  p_cleaning_cents integer default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_org uuid;
  v_rental uuid;
  v_category uuid;
begin
  select u.org_id into v_org from public.units u where u.id = p_unit_id;
  -- The unit must belong to the org the caller is working in (the session's
  -- active org). A multi-org user can therefore never book a rental into another
  -- org by passing one of its units; RLS still decides what the caller may write.
  if v_org is null or v_org <> p_org_id then
    raise exception 'unit not found' using errcode = '42501';
  end if;

  select c.id into v_category from public.finance_categories c
   where c.org_id = v_org and c.system_key = 'rental';
  if v_category is null then
    raise exception 'rental category missing' using errcode = '42501';
  end if;

  insert into public.finance_entries (
    org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id,
    payment_method, counterparty, note, stay_start, stay_end, channel, guests, receipt_path
  ) values (
    v_org, 'income', v_category, p_occurred_on, p_amount_cents, p_currency, p_fx_rate_pen, p_unit_id,
    p_payment_method, p_guest_name, p_note, p_stay_start, p_stay_end, p_channel, p_guests, p_receipt_path
  ) returning id into v_rental;

  if coalesce(p_commission_cents, 0) > 0 then
    select c.id into v_category from public.finance_categories c
     where c.org_id = v_org and c.system_key = 'platform_commission';
    if v_category is null then
      raise exception 'commission category missing' using errcode = '42501';
    end if;
    insert into public.finance_entries (
      org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id,
      payment_method, related_entry_id
    ) values (
      v_org, 'expense', v_category, p_occurred_on, p_commission_cents, p_currency, p_fx_rate_pen, p_unit_id,
      case when p_channel in ('airbnb', 'booking') then 'platform'::public.finance_payment_method end, v_rental
    );
  end if;

  if coalesce(p_cleaning_cents, 0) > 0 then
    select c.id into v_category from public.finance_categories c
     where c.org_id = v_org and c.system_key = 'cleaning';
    if v_category is null then
      raise exception 'cleaning category missing' using errcode = '42501';
    end if;
    insert into public.finance_entries (
      org_id, kind, category_id, occurred_on, amount_cents, currency, fx_rate_pen, unit_id,
      related_entry_id
    ) values (
      v_org, 'expense', v_category, p_stay_end, p_cleaning_cents, p_currency, p_fx_rate_pen, p_unit_id,
      v_rental
    );
  end if;

  return v_rental;
end;
$$;

revoke execute on function public.create_rental_entries(
  uuid, uuid, date, date, public.finance_channel, date, integer, public.currency_code,
  integer, text, numeric, public.finance_payment_method, text, text, integer, integer
) from public, anon;
grant execute on function public.create_rental_entries(
  uuid, uuid, date, date, public.finance_channel, date, integer, public.currency_code,
  integer, text, numeric, public.finance_payment_method, text, text, integer, integer
) to authenticated;
