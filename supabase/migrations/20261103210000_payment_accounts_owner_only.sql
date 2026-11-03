-- SD-411 (security review): only the OWNER may create, change or delete payment accounts.
-- Rollback: drop the three policies below and recreate them with private.is_member(org_id) as in 20261029185857_booking_schema.sql.
--
-- Why: these accounts (Yape/Plin number, bank account, CCI) are shown to every guest who is about to pay a deposit
-- (get_booking_payment_info). A staff member who could edit them could send customers' money to their own account, and
-- the Settings screen is not the only way in: PostgREST with the staff member's own session would do it too. So the rule
-- lives in the database, like the finance ledger and the iCal feeds (private.is_owner).
-- Reading stays open to members (the select policy is unchanged): it is information the lodging hands to every payer.
begin;

drop policy property_payment_accounts_insert on public.property_payment_accounts;
drop policy property_payment_accounts_update on public.property_payment_accounts;
drop policy property_payment_accounts_delete on public.property_payment_accounts;

create policy property_payment_accounts_insert on public.property_payment_accounts for insert to authenticated
  with check (private.is_owner(org_id));
create policy property_payment_accounts_update on public.property_payment_accounts for update to authenticated
  using (private.is_owner(org_id)) with check (private.is_owner(org_id));
create policy property_payment_accounts_delete on public.property_payment_accounts for delete to authenticated
  using (private.is_owner(org_id));

commit;
