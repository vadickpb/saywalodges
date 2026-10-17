-- SD-101: is_member() must correctly say yes for the caller's own org and
-- no for any other org — this is the primitive every RLS policy (SD-102)
-- builds on. Simulates a specific authenticated user the same way
-- PostgREST does: set_config('request.jwt.claims', ...) + `set local role
-- authenticated`, both scoped to this transaction only (rolled back, never
-- visible outside this test). Moved from public to private in SD-102 (not
-- exposed via PostgREST's /rpc) — see that migration's comments.
begin;
select plan(4);

-- Saywa Lodges' owner (seeded in supabase/seed.sql)
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select ok(
  private.is_member('bf88f504-051f-4fdc-ab73-4fa12d715817'),
  'Saywa owner is a member of the Saywa org'
);
select ok(
  not private.is_member('ff24bacc-47d2-40bc-9210-f860e98892fd'),
  'Saywa owner is NOT a member of the Demo org'
);

-- Demo org's owner
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);

select ok(
  private.is_member('ff24bacc-47d2-40bc-9210-f860e98892fd'),
  'Demo owner is a member of the Demo org'
);
select ok(
  not private.is_member('bf88f504-051f-4fdc-ab73-4fa12d715817'),
  'Demo owner is NOT a member of the Saywa org'
);

select * from finish();
rollback;
