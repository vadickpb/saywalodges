-- SD-1119: the public site shows the spaces of the parts (Villa I + Villa II) on the page of a combined unit (Villa Completa),
-- so visitors can read which units make it up. Only the published property's rows of an active combination are visible to anon.
-- No unit data is exposed beyond ids already public (units are readable by anon when active).
-- Rollback: drop policy unit_components_public_select on public.unit_components; revoke select on public.unit_components from anon;
begin;

create policy unit_components_public_select on public.unit_components for select to anon
  using (
    private.is_property_published(property_id)
    and exists (select 1 from public.units p where p.id = unit_components.parent_unit_id and p.active)
    and exists (select 1 from public.units c where c.id = unit_components.child_unit_id and c.active)
  );
grant select (parent_unit_id, child_unit_id, property_id) on public.unit_components to anon;

commit;
