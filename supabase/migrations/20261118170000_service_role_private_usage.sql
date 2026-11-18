-- SD-1116: let service_role reach the `private` schema.
-- Triggers that run as the caller (finance_entries_related_guard calls private.is_owner) failed with
-- "permission denied for schema private" for service-role writes on projects where service_role has no default
-- USAGE (found while resetting a fresh demo project). service_role already bypasses RLS, so this adds no new data
-- access; function EXECUTE grants in `private` stay as each function defines them. Additive and idempotent.
-- Rollback: revoke usage on schema private from service_role;
grant usage on schema private to service_role;
