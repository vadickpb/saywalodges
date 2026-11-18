-- SD-1117: service_role may execute private.is_owner (finance_entries related guard); anon may not.
begin;
select plan(2);
select ok(has_function_privilege('service_role', 'private.is_owner(uuid)', 'execute'), 'service_role can execute private.is_owner');
select ok(not has_function_privilege('anon', 'private.is_owner(uuid)', 'execute'), 'anon still cannot execute private.is_owner');
select * from finish();
rollback;
