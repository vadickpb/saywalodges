-- SD-1004: public.health_snapshot() — service_role only, counts only, correct staleness rules.
-- Ids from supabase/seed.sql: org Saywa bf88f504-..., property 131583b5-..., unit ee204001-...0001.
begin;
select plan(14);

-- ─── Catalog and grants ─────────────────────────────────────────────────────
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'public.health_snapshot()'::regprocedure),
  'health_snapshot is SECURITY DEFINER with an empty search_path');
select ok(not has_function_privilege('anon', 'public.health_snapshot()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.health_snapshot()', 'EXECUTE'),
  'anon and authenticated cannot execute it');
select ok(has_function_privilege('service_role', 'public.health_snapshot()', 'EXECUTE'), 'service_role can execute it');

-- ─── Shape: only the four agreed keys, all scalars ──────────────────────────
select is((select array_agg(k order by k) from jsonb_object_keys(public.health_snapshot()) k),
  array['failing_feeds', 'last_migration', 'overdue_holds', 'stale_feeds'], 'exactly the four keys, nothing else leaves');
select ok((select bool_and(jsonb_typeof(v) in ('number', 'string')) from jsonb_each(public.health_snapshot()) e(k, v)),
  'every value is a number or a string (no nested data)');
select ok(public.health_snapshot()->>'last_migration' ~ '^[0-9]{14}$', 'last_migration is a 14-digit version');

-- ─── Baselines ──────────────────────────────────────────────────────────────
create temp table base as select public.health_snapshot() s;

-- ─── Holds: overdue only counts without a payment under review ──────────────
insert into public.guests (id, org_id, name, email) values
  ('b1040000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'Health Guest', 'health1004@example.com');
insert into public.quotes (id, org_id, property_id, unit_id, token, check_in, check_out, guests, currency,
  total_cents, deposit_cents, expires_at, created_at)
select ('b1040000-0000-4000-8000-00000000001' || n)::uuid, 'bf88f504-051f-4fdc-ab73-4fa12d715817',
       '131583b5-785e-4127-81f0-e097163c5654', 'ee204001-0000-4000-8000-000000000001',
       rpad('q1004-' || n, 40, 'x'), '2028-03-10', '2028-03-12', 2, 'USD', 60000, 30000, now() + interval '1 day', now()
from generate_series(1, 3) n;
-- n=1 expired 2 h ago (counts) · n=2 expired 10 min ago (still within the job's tolerance) ·
-- n=3 expired 2 h ago but with a payment under review (the job leaves it alone, so it does not count)
insert into public.bookings (id, org_id, property_id, unit_id, guest_id, quote_id, check_in, check_out, guests, currency,
  total_cents, deposit_cents, status, expires_at)
select ('b2040000-0000-4000-8000-00000000001' || n)::uuid, q.org_id, q.property_id, q.unit_id,
       'b1040000-0000-4000-8000-000000000001', q.id,
       ('2028-0' || (3 + n) || '-10')::date, ('2028-0' || (3 + n) || '-12')::date, 2, q.currency, q.total_cents, q.deposit_cents,
       'pending_payment',
       case n when 1 then now() - interval '2 hours' when 2 then now() - interval '10 minutes' else now() - interval '2 hours' end
from public.quotes q, generate_series(1, 3) n
where q.id = ('b1040000-0000-4000-8000-00000000001' || n)::uuid;
insert into public.payments (id, org_id, booking_id, amount_cents, currency, method) values
  ('b3040000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'b2040000-0000-4000-8000-000000000013', 30000, 'USD', 'yape');
select is((public.health_snapshot()->>'overdue_holds')::int - (select (s->>'overdue_holds')::int from base), 1,
  'only the hold that is 2 h overdue and has no payment under review is counted');

-- ─── Feeds: stale vs fresh vs no URL ────────────────────────────────────────
insert into public.ical_feeds (id, org_id, unit_id, channel, import_url, last_attempt_at, created_at, failing_since) values
  ('f1040000-0000-4000-8000-000000000001', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'airbnb',  'https://www.airbnb.com/h1', now() - interval '3 hours', now() - interval '1 day', null),
  ('f1040000-0000-4000-8000-000000000002', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'booking', 'https://www.booking.com/h2', now() - interval '5 minutes', now() - interval '1 day', now() - interval '20 minutes'),
  ('f1040000-0000-4000-8000-000000000003', 'bf88f504-051f-4fdc-ab73-4fa12d715817', 'ee204001-0000-4000-8000-000000000001', 'vrbo',    null, null, now() - interval '1 day', null);
select is((public.health_snapshot()->>'stale_feeds')::int - (select (s->>'stale_feeds')::int from base), 1,
  'only the feed with a URL and a 3 h old attempt is stale (fresh one and the one without URL are not)');
select is((public.health_snapshot()->>'failing_feeds')::int - (select (s->>'failing_feeds')::int from base), 1,
  'one feed with a URL is failing');

-- A feed that was never attempted counts from its creation.
update public.ical_feeds set last_attempt_at = null where id = 'f1040000-0000-4000-8000-000000000001';
select is((public.health_snapshot()->>'stale_feeds')::int - (select (s->>'stale_feeds')::int from base), 1,
  'a never-attempted feed older than an hour is stale');
update public.ical_feeds set created_at = now() - interval '5 minutes' where id = 'f1040000-0000-4000-8000-000000000001';
select is((public.health_snapshot()->>'stale_feeds')::int - (select (s->>'stale_feeds')::int from base), 0,
  'a brand-new, never-attempted feed is not stale yet');

-- ─── Callers without privilege are refused ──────────────────────────────────
set local role anon;
select throws_ok($$select public.health_snapshot()$$, '42501', null, 'anon is refused');
reset role;
set local role authenticated;
select throws_ok($$select public.health_snapshot()$$, '42501', null, 'authenticated is refused');
reset role;

select * from finish();
rollback;
