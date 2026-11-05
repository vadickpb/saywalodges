-- SD-412: RPC authorization, final protection, stable claims and race rechecks.
begin;
select plan(21);
insert into public.guests (id, org_id, name, email) values
  ('b0050000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'Voucher Guest', 'voucher405@example.com');
insert into public.quotes (id, org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
  total_cents, deposit_cents, expires_at, created_at)
select ('b1050000-0000-4000-8000-00000000000' || n)::uuid, 'bf88f504-051f-4fdc-ab73-4fa12d715817',
       '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
       rpad('q405-' || n, 40, 'x'), ('2028-0' || (6 + n) || '-10')::date, ('2028-0' || (6 + n) || '-12')::date, 2, 'USD',
       60000, 30000, now() + interval '1 day', now()
from generate_series(1, 2) n;
insert into public.bookings (id, org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out, guests, currency,
  total_cents, deposit_cents, status, expires_at, public_token)
select ('b2050000-0000-4000-8000-00000000000' || n)::uuid, q.org_id, q.property_id, q.unit_id,
       'b0050000-0000-4000-8000-000000000001', q.id, q.check_in, q.check_out, 2, 'USD', 60000, 30000, 'pending_payment',
       case n when 1 then now() + interval '1 day' else now() - interval '1 hour' end,
       case n when 1 then repeat('c4', 32) else repeat('d5', 32) end
from public.quotes q, generate_series(1, 2) n
where q.id = ('b1050000-0000-4000-8000-00000000000' || n)::uuid;

insert into storage.objects (id, bucket_id, name, created_at)
select ('a4120000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'payment-vouchers',
  case when n = 7 then '00000000-0000-4000-8000-000000000000' else 'bf88f504-051f-4fdc-ab73-4fa12d715817' end
    || '/' || repeat('c4', 32) || '/a4120000-0000-4000-8000-' || lpad(n::text, 12, '0') || '.pdf',
  case when n = 2 then now() - interval '23 hours' else now() - interval '40 days' end
from generate_series(1, 9) n;
insert into public.payments (org_id, booking_id, amount_cents, currency, method, voucher_path, status, reviewed_at)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2050000-0000-4000-8000-000000000001', 30000, 'USD', 'yape',
  name, case n when 3 then 'approved'::public.payment_status when 4 then 'pending_review'::public.payment_status else 'rejected'::public.payment_status end,
  case when n = 4 then null when n = 6 then now() - interval '1 day' else now() - interval '31 days' end
from storage.objects, generate_series(3, 6) n
where id = ('a4120000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;

select ok(not has_function_privilege('anon', 'public.cron_list_voucher_purge()', 'EXECUTE'), 'anon cannot list');
select ok(not has_function_privilege('authenticated', 'public.cron_list_voucher_purge()', 'EXECUTE'), 'members cannot list across orgs');
select ok(not has_function_privilege('anon', 'public.cron_claim_voucher_purge(uuid,jsonb)', 'EXECUTE'), 'anon cannot claim');
select ok(not has_function_privilege('authenticated', 'public.cron_claim_voucher_purge(uuid,jsonb)', 'EXECUTE'), 'members cannot claim');
select ok((select relrowsecurity from pg_class where oid = 'private.voucher_purge_claims'::regclass), 'private tombstones have RLS');
select ok(not has_table_privilege('authenticated', 'private.voucher_purge_claims', 'SELECT'), 'no tombstone access');
set local role service_role;
select is(jsonb_array_length(public.cron_list_voucher_purge()), 5, 'old orphans, old rejection and deleted-org objects selected');
select ok(not exists (select 1 from jsonb_array_elements(public.cron_list_voucher_purge()) v
  where v->>'payment_status' in ('approved', 'pending_review')), 'protected payments never listed');
reset role;
select is(public.cron_claim_voucher_purge(id, to_jsonb(v)), false, 'approved cannot be claimed')
  from private.voucher_purge_inventory v where id = 'a4120000-0000-4000-8000-000000000003';
select is(public.cron_claim_voucher_purge(id, to_jsonb(v)), false, 'pending review cannot be claimed')
  from private.voucher_purge_inventory v where id = 'a4120000-0000-4000-8000-000000000004';
select is(public.cron_claim_voucher_purge(id, to_jsonb(v)), false, 'young upload cannot be claimed')
  from private.voucher_purge_inventory v where id = 'a4120000-0000-4000-8000-000000000002';
select is(public.cron_claim_voucher_purge(id, to_jsonb(v)), false, 'recent rejection retained')
  from private.voucher_purge_inventory v where id = 'a4120000-0000-4000-8000-000000000006';
select is(public.cron_claim_voucher_purge(id, to_jsonb(v)), true, 'orphan claimed')
  from private.voucher_purge_inventory v where id = 'a4120000-0000-4000-8000-000000000001';
select is(public.cron_claim_voucher_purge(id, to_jsonb(v)), true, 'claim idempotent after interrupted deletion')
  from private.voucher_purge_inventory v where id = 'a4120000-0000-4000-8000-000000000001';
select throws_ok($$insert into public.payments (org_id, booking_id, amount_cents, currency, method, voucher_path)
  select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2050000-0000-4000-8000-000000000002', 30000, 'USD', 'yape', path
  from private.voucher_purge_inventory where id = 'a4120000-0000-4000-8000-000000000001'$$,
  'SD003', 'voucher file unavailable', 'payment writer loses race to claim and cannot associate');
create temporary table stale_snapshot as select id, to_jsonb(v) as snapshot from private.voucher_purge_inventory v
  where id = 'a4120000-0000-4000-8000-000000000008';
insert into public.payments (org_id, booking_id, amount_cents, currency, method, voucher_path)
  select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2050000-0000-4000-8000-000000000002', 30000, 'USD', 'yape', path
  from private.voucher_purge_inventory where id = 'a4120000-0000-4000-8000-000000000008';
select is(public.cron_claim_voucher_purge(id, snapshot), false, 'claim loses race to association and cannot delete') from stale_snapshot;
select is(public.cron_claim_voucher_purge('a4120000-0000-4000-8000-000000000099', '{}'::jsonb), false, 'absent object is harmless');
select is(public.cron_claim_voucher_purge(id, '{}'::jsonb), false, 'changed snapshot fails closed')
  from private.voucher_purge_inventory v where id = 'a4120000-0000-4000-8000-000000000009';
select is((select count(*)::int from storage.objects where bucket_id = 'payment-vouchers' and id::text like 'a412%'), 9,
  'RPC never deletes Storage rows');
insert into storage.objects (bucket_id, name, created_at)
select 'payment-vouchers', 'orphan-' || n, now() - interval '40 days' from generate_series(1, 110) n;
select is(jsonb_array_length(public.cron_list_voucher_purge()), 100, 'hard batch cap');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
  where oid in ('public.cron_list_voucher_purge()'::regprocedure, 'public.cron_claim_voucher_purge(uuid,jsonb)'::regprocedure)),
  'service RPCs use security definer with empty search_path');
select * from finish();
rollback;
