-- SD-1004: read-only health snapshot for the central installation monitor (ADR 0010).
-- Rollback: drop function public.health_snapshot();
--
-- Trust model
--  * service_role only (called by GET /api/health after it authenticated HEALTH_SECRET); anon,
--    authenticated and public cannot execute it. It writes nothing.
--  * Returns counts and one migration version only: no ids, names, e-mails, URLs or guest data, so a
--    leaked response reveals nothing about the business beyond "how many" and "how stale".
--  * The cron jobs leave no run log, so their health is inferred from their effects:
--      - expire-holds not running  → pending_payment bookings far past expires_at (and without a payment
--        under review, which the job deliberately leaves alone);
--      - ical-sync not running     → feeds with an import URL whose last attempt is old. With no feeds
--        there is no signal and the figure is 0.
begin;

create function public.health_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    -- supabase_migrations.schema_migrations is not exposed through the API; this is the only way out.
    'last_migration', (select max(version) from supabase_migrations.schema_migrations),
    -- The job runs every 15 min; 30 min past expires_at means at least two missed runs.
    'overdue_holds', (
      select count(*)::integer from public.bookings b
      where b.status = 'pending_payment' and b.expires_at <= now() - interval '30 minutes'
        and not exists (select 1 from public.payments p where p.booking_id = b.id and p.status = 'pending_review')),
    -- A feed becomes due 10 min after its last attempt; over an hour means the job is not running.
    'stale_feeds', (
      select count(*)::integer from public.ical_feeds f
      where f.import_url is not null
        and coalesce(f.last_attempt_at, f.created_at) < now() - interval '60 minutes'),
    'failing_feeds', (select count(*)::integer from public.ical_feeds f where f.import_url is not null and f.failing_since is not null)
  );
$$;
revoke all on function public.health_snapshot() from public, anon, authenticated;
grant execute on function public.health_snapshot() to service_role;

commit;
