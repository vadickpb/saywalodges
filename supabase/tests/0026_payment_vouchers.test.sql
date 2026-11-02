-- SD-405: voucher upload policy, get_booking_payment_info, submit_payment_voucher, member-only read.
-- Ids from supabase/seed.sql: org Saywa bf88f504-... (property 131583b5-..., unit ee204001-...0001), org Demo ff24bacc-...
-- Saywa owner a3b45db1-..., Demo owner bd6a1c86-...
begin;
select plan(43);

-- ─── Fixtures (table owner) ─────────────────────────────────────────────────
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
-- accounts: one usable (active, USD), one inactive, one in another currency
insert into public.property_payment_accounts (org_id, property_id, kind, holder_name, phone, currency, active, sort_order) values
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'yape', 'Ana Titular', '51900000001', 'USD', true, 0),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'plin', 'Cuenta Inactiva', '51900000002', 'USD', false, 1),
  ('bf88f504-051f-4fdc-ab73-4fa12d715817', '131583b5-785e-4127-81f0-e097163c5654', 'yape', 'Cuenta Soles', '51900000003', 'PEN', true, 2);

-- ─── Catalog and grants ─────────────────────────────────────────────────────
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'private.voucher_upload_allowed(text)'::regprocedure,
  'public.get_booking_payment_info(text,text)'::regprocedure,
  'public.submit_payment_voucher(text,text,text,public.payment_method,text)'::regprocedure)),
  'all three functions are SECURITY DEFINER with an empty search_path');
select ok(has_function_privilege('anon', 'public.get_booking_payment_info(text,text)', 'EXECUTE')
  and has_function_privilege('anon', 'public.submit_payment_voucher(text,text,text,public.payment_method,text)', 'EXECUTE'),
  'anon can call the two public functions');
select ok(not has_table_privilege('anon', 'public.payments', 'SELECT') and not has_table_privilege('anon', 'public.payments', 'INSERT'),
  'anon still has no access to payments');
select ok((select not public and file_size_limit = 5242880 from storage.buckets where id = 'payment-vouchers'), 'the bucket is private and capped at 5 MB');
select ok(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'payment_vouchers_%' and cmd in ('UPDATE', 'DELETE', 'ALL')),
  'there is no update or delete policy: vouchers are immutable');

-- ─── get_booking_payment_info ───────────────────────────────────────────────
select is((public.get_booking_payment_info('saywa-lodges', repeat('c4', 32))->>'deposit_cents')::int, 30000, 'the deposit comes from the booking');
select is(jsonb_array_length(public.get_booking_payment_info('saywa-lodges', repeat('c4', 32))->'accounts'), 1,
  'only the active account in the booking currency is shown');
select is(public.get_booking_payment_info('saywa-lodges', repeat('c4', 32))->>'upload_prefix',
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/', 'it gives the exact upload folder');
select is(public.get_booking_payment_info('demo', repeat('c4', 32)), null, 'another site''s host sees nothing');
select is(public.get_booking_payment_info('saywa-lodges', 'nope'), null, 'a malformed token sees nothing');
select is(public.get_booking_payment_info('saywa-lodges', repeat('d5', 32)), null, 'a lapsed hold shows no payment details (H2)');

-- ─── Upload policy (as the anonymous guest) ─────────────────────────────────
set local role anon;
select lives_ok($$insert into storage.objects (bucket_id, name) values ('payment-vouchers',
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000001.png')$$,
  'a guest can upload a voucher to their own booking folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('payment-vouchers',
  'ff24bacc-47d2-40bc-9210-f860e98892fd/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000002.png')$$,
  '42501', null, 'a folder with another organization is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('payment-vouchers',
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('e6', 32) || '/00000000-0000-4000-8000-000000000002.png')$$,
  '42501', null, 'an unknown token is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('payment-vouchers',
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/evil.png')$$,
  '42501', null, 'a file name that is not a uuid is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('payment-vouchers',
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000003.exe')$$,
  '42501', null, 'an extension outside jpg/png/webp/pdf is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('payment-vouchers',
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/sub/00000000-0000-4000-8000-000000000003.png')$$,
  '42501', null, 'a deeper path is refused');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('payment-vouchers',
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('d5', 32) || '/00000000-0000-4000-8000-000000000004.png')$$,
  '42501', null, 'a booking whose hold ran out cannot receive files');
select lives_ok($$insert into storage.objects (bucket_id, name)
  select 'payment-vouchers', 'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-00000000001' || n || '.png'
  from generate_series(1, 4) n$$, 'four more files fill the allowance of five');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('payment-vouchers',
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000099.png')$$,
  '42501', null, 'the sixth file is refused (the token cannot fill the bucket)');

-- ─── submit_payment_voucher ─────────────────────────────────────────────────
select throws_ok($$select public.submit_payment_voucher('demo', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000001.png', 'yape')$$,
  'P0002', null, 'the wrong host cannot register a voucher');
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-0000000000aa.png', 'yape')$$,
  'SD003', null, 'a path with no uploaded file is refused (its own error code)');
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('d5', 32) || '/00000000-0000-4000-8000-000000000001.png', 'yape')$$,
  '22023', null, 'a path from another booking is refused');
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000001.png', 'cash')$$,
  '22023', null, 'a guest cannot register a cash payment');
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000001.png', 'yape', E'a\nb')$$,
  '22023', null, 'a reference with control characters is refused');
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000001.png', 'yape', 'Op ' || chr(8238) || '321')$$,
  '22023', null, 'a reference with a text-direction override is refused too');
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('d5', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('d5', 32) || '/00000000-0000-4000-8000-000000000001.png', 'yape')$$,
  '55000', null, 'a lapsed hold cannot receive a voucher');
select is(public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000001.png', 'yape', 'Op 12345'),
  '{"voucher": "under_review"}'::jsonb, 'a valid voucher is registered and goes under review');
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000011.png', 'yape')$$,
  '23505', null, 'a second voucher while one is under review is refused');
reset role;

-- ─── Effects, as the table owner ────────────────────────────────────────────
select is((select amount_cents || ' ' || currency || ' ' || method || ' ' || status from public.payments
  where booking_id = 'b2050000-0000-4000-8000-000000000001'), '30000 USD yape pending_review',
  'the payment takes its amount and currency from the booking, never from the guest');
select is(public.get_booking_payment_info('saywa-lodges', repeat('c4', 32)), null, 'with a voucher under review the payment details disappear');
select is(public.get_booking_status('saywa-lodges', repeat('c4', 32))->>'voucher', 'under_review', 'the status page shows it under review');
update public.bookings set expires_at = now() - interval '2 hours' where id = 'b2050000-0000-4000-8000-000000000001';
select public.expire_holds();
select is((select status::text from public.bookings where id = 'b2050000-0000-4000-8000-000000000001'), 'pending_payment',
  'the expiry sweep leaves a booking with a voucher under review');


-- ─── More lifecycle coverage (as the table owner) ───────────────────────────
-- The same file cannot back two payments (unique index), even after the first is rejected.
update public.payments set status = 'rejected', reject_reason = 'illegible', reviewed_at = now()
  where booking_id = 'b2050000-0000-4000-8000-000000000001';
update public.bookings set expires_at = now() + interval '1 day' where id = 'b2050000-0000-4000-8000-000000000001';
select is(public.get_booking_status('saywa-lodges', repeat('c4', 32))->>'voucher', 'rejected', 'after the owner rejects it, the guest sees the voucher as rejected');
select ok(public.get_booking_payment_info('saywa-lodges', repeat('c4', 32)) is not null, 'a rejected voucher reopens the payment details');
set local role anon;
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000001.png', 'yape')$$,
  '23505', null, 'the same file cannot be registered twice');
select is(public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000011.png', 'plin'),
  '{"voucher": "under_review"}'::jsonb, 'a new file can be submitted after a rejection');
reset role;
-- Five attempts in total, then the cap (SD002).
update public.payments set status = 'rejected', reject_reason = 'again', reviewed_at = now() where booking_id = 'b2050000-0000-4000-8000-000000000001' and status = 'pending_review';
insert into public.payments (org_id, booking_id, amount_cents, currency, method, status, reject_reason, reviewed_at)
select 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2050000-0000-4000-8000-000000000001', 30000, 'USD', 'yape', 'rejected', 'x', now() from generate_series(1, 3);
set local role anon;
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000012.png', 'yape')$$,
  'SD002', null, 'after five attempts a sixth is refused (its own error code)');
reset role;
-- A cancelled booking cannot receive a voucher.
update public.bookings set status = 'cancelled', cancelled_at = now(), expires_at = null where id = 'b2050000-0000-4000-8000-000000000001';
set local role anon;
select throws_ok($$select public.submit_payment_voucher('saywa-lodges', repeat('c4', 32),
  'bf88f504-051f-4fdc-ab73-4fa12d715817/' || repeat('c4', 32) || '/00000000-0000-4000-8000-000000000013.png', 'yape')$$,
  '55000', null, 'a cancelled booking cannot receive a voucher');
reset role;

-- ─── Reading and tampering with stored vouchers ─────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'payment-vouchers'), 5, 'a member of the booking''s organization sees its vouchers');
select throws_ok($$delete from storage.objects where bucket_id = 'payment-vouchers'$$, '42501', null,
  'even a member cannot delete a voucher (Storage forbids direct deletes and there is no delete policy)');
reset role;
select set_config('request.jwt.claims', '{"sub":"bd6a1c86-01e2-40a4-ba79-4e28b373e880"}', true);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'payment-vouchers'), 0, 'a member of another organization sees none');
reset role;
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'payment-vouchers'), 0, 'the anonymous guest cannot read vouchers back');
reset role;

select * from finish();
rollback;
