-- SD-412: additive inventory/claim RPCs; Storage API remains the only object deleter.
-- Rollback: disable the scheduler, drop the trigger/functions/view/table (claims must not
-- be dropped while a Storage deletion is in flight). No existing payment data is changed.
begin;

-- Infrastructure tombstones, deliberately independent of organizations that may be deleted.
-- Keep only a hash, never voucher paths/tokens. Permanent: a claimed UUID path cannot be reused.
create table private.voucher_purge_claims (
  path_hash bigint primary key,
  created_at timestamptz not null default now()
);
alter table private.voucher_purge_claims enable row level security;
revoke all on private.voucher_purge_claims from public, anon, authenticated, service_role;

create function private.guard_purged_voucher() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.voucher_path is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.voucher_path, 412));
    if exists (select 1 from private.voucher_purge_claims
      where path_hash = pg_catalog.hashtextextended(new.voucher_path, 412)) then
      raise exception 'voucher file unavailable' using errcode = 'SD003';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_purged_voucher() from public, anon, authenticated, service_role;
create trigger payments_purge_guard before insert or update of voucher_path, status on public.payments
  for each row execute function private.guard_purged_voucher();

create view private.voucher_purge_inventory as
select o.id, o.name as path, o.created_at,
  exists (select 1 from public.organizations org where org.id = private.storage_path_org(o.name)) as org_exists,
  p.status::text as payment_status, p.reviewed_at,
  b.status::text as booking_status, b.updated_at as booking_updated_at
from storage.objects o
left join public.payments p on p.voucher_path = o.name
left join public.bookings b on b.id = p.booking_id
where o.bucket_id = 'payment-vouchers';
revoke all on private.voucher_purge_inventory from public, anon, authenticated, service_role;

-- Mirrors the pure selector, also enforcing retention at the final claim boundary.
-- 24h for orphans/deleted organizations; 30 days from review/last booking change otherwise.
create function private.voucher_purge_due(v private.voucher_purge_inventory) returns boolean
language sql stable set search_path = '' as $$
  select v.created_at < now() - interval '24 hours'
    and coalesce(v.payment_status not in ('approved', 'pending_review'), true)
    and (not v.org_exists or v.payment_status is null
      or (v.payment_status = 'rejected' and v.reviewed_at < now() - interval '30 days')
      or (v.booking_status in ('expired', 'cancelled') and v.booking_updated_at < now() - interval '30 days'));
$$;
revoke all on function private.voucher_purge_due(private.voucher_purge_inventory) from public, anon, authenticated, service_role;

create function public.cron_list_voucher_purge() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (
    select i.* from private.voucher_purge_inventory i
    where private.voucher_purge_due(i)
    order by i.created_at, i.id limit 100
  ) v;
$$;
revoke all on function public.cron_list_voucher_purge() from public, anon, authenticated;
grant execute on function public.cron_list_voucher_purge() to service_role;

-- Serialize with ALL payment writers, then re-read: a new pending/approved association
-- invalidates the snapshot. After committing the tombstone no writer can attach this path.
-- Retrying a claim is harmless, including after a failed/interrupted Storage API request.
create function public.cron_claim_voucher_purge(p_id uuid, p_snapshot jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v private.voucher_purge_inventory;
  v_path text;
begin
  select name into v_path from storage.objects where id = p_id and bucket_id = 'payment-vouchers';
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_path, 412));
  select * into v from private.voucher_purge_inventory where id = p_id;
  if not found or to_jsonb(v) is distinct from p_snapshot or not private.voucher_purge_due(v) then
    return false;
  end if;
  insert into private.voucher_purge_claims (path_hash)
    values (pg_catalog.hashtextextended(v.path, 412)) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.cron_claim_voucher_purge(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.cron_claim_voucher_purge(uuid, jsonb) to service_role;
commit;
