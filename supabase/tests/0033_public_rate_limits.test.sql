begin;
select plan(11);

select has_table('public', 'public_rate_limits', 'counter table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.public_rate_limits'::regclass), 'RLS enabled');

set local role anon;
select throws_ok($$select * from public.public_rate_limits$$, '42501', null, 'anon cannot read counters');
select is(public.check_public_rate_limit('quote', repeat('a', 64), 2, 60), true, '1st request allowed');
select is(public.check_public_rate_limit('quote', repeat('a', 64), 2, 60), true, '2nd request allowed');
select is(public.check_public_rate_limit('quote', repeat('a', 64), 2, 60), false, '3rd request over the limit');
select is(public.check_public_rate_limit('quote', repeat('b', 64), 2, 60), true, 'another key has its own budget');
select is(public.check_public_rate_limit('voucher', repeat('a', 64), 2, 60), true, 'another scope has its own budget');
select throws_ok($$select public.check_public_rate_limit('other', repeat('a', 64), 2, 60)$$, '22023', null, 'unknown scope rejected');
select throws_ok($$select public.check_public_rate_limit('quote', 'short', 2, 60)$$, '22023', null, 'short key rejected');
select throws_ok($$select public.check_public_rate_limit('quote', repeat('a', 64), 5000, 60)$$, '22023', null, 'huge limit rejected');

select * from finish();
rollback;
