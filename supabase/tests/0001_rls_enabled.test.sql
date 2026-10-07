-- Regression test: RLS must stay enabled on every business table. There are
-- no policies yet (Fase 1 / SD-102 adds them), so this only guards against
-- someone accidentally disabling RLS — not against unauthorized access.
-- supabase/CLAUDE.md: every table needs a pgTAP test; this is it for now.
begin;
select plan(6);

select ok(
  (select relrowsecurity from pg_class where relname = 'properties' and relnamespace = 'public'::regnamespace),
  'RLS enabled on public.properties'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'rooms' and relnamespace = 'public'::regnamespace),
  'RLS enabled on public.rooms'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'photos' and relnamespace = 'public'::regnamespace),
  'RLS enabled on public.photos'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'rate_tiers' and relnamespace = 'public'::regnamespace),
  'RLS enabled on public.rate_tiers'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'amenities' and relnamespace = 'public'::regnamespace),
  'RLS enabled on public.amenities'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'distances' and relnamespace = 'public'::regnamespace),
  'RLS enabled on public.distances'
);

select * from finish();
rollback;
