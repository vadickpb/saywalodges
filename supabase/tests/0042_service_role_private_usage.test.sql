-- SD-1116: service_role can use the private schema (needed by caller-rights triggers); anon cannot see more than before.
begin;
select plan(2);
select ok(has_schema_privilege('service_role', 'private', 'usage'), 'service_role has USAGE on schema private');
select ok(has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated keeps USAGE on schema private');
select * from finish();
rollback;
