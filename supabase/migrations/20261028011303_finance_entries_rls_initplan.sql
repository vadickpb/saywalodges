-- finance_entries: evaluate auth.uid() once per statement instead of once per row.
-- Same rules as 20261027184334_finance_ledger.sql, only wrapped as (select auth.uid())
-- (Supabase advisor 0003_auth_rls_initplan). Behaviour is unchanged: the owner
-- sees and edits everything; staff only the rows they created.

drop policy finance_entries_select on public.finance_entries;
drop policy finance_entries_insert on public.finance_entries;
drop policy finance_entries_update on public.finance_entries;
drop policy finance_entries_delete on public.finance_entries;

create policy finance_entries_select on public.finance_entries for select to authenticated
  using (private.is_owner(org_id) or (private.is_member(org_id) and created_by = (select auth.uid())));
create policy finance_entries_insert on public.finance_entries for insert to authenticated
  with check (
    private.is_member(org_id)
    and (private.is_owner(org_id) or created_by = (select auth.uid()))
  );
create policy finance_entries_update on public.finance_entries for update to authenticated
  using (private.is_owner(org_id) or (private.is_member(org_id) and created_by = (select auth.uid())))
  with check (
    (private.is_owner(org_id) or (private.is_member(org_id) and created_by = (select auth.uid())))
  );
create policy finance_entries_delete on public.finance_entries for delete to authenticated
  using (private.is_owner(org_id) or (private.is_member(org_id) and created_by = (select auth.uid())));
