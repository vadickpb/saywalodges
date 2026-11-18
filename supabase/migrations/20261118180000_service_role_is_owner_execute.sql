-- SD-1117: let service_role call private.is_owner (follow-up of SD-1116).
-- The finance_entries related-entry trigger runs as the caller and calls private.is_owner; with service_role it failed
-- with "permission denied for function is_owner" because EXECUTE was granted to `authenticated` only. For a service-role
-- write is_owner is false (no auth.uid), so the trigger falls through to its existence check, which service_role can run.
-- Narrow on purpose: one function, no other `private` function is opened. Additive and idempotent.
-- Rollback: revoke execute on function private.is_owner(uuid) from service_role;
grant execute on function private.is_owner(uuid) to service_role;
