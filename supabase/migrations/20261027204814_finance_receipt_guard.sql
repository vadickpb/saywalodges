-- SD-803 review fixes. Additive migration (SD-801's migration is already merged).
-- Rollback: drop function public.delete_finance_entry(uuid);
--   drop trigger finance_entries_receipt_guard on public.finance_entries;
--   drop function private.finance_entries_receipt_guard();
--   alter table public.finance_entries drop constraint finance_entries_receipt_format_check;
--   drop index public.finance_entries_receipt_path_key;

-- ─── Receipts must be real, visible to the writer, and used once ────────────
-- receipt_path used to accept ANY path under the org prefix. A member could point
-- an entry at an object they never uploaded (or at another entry's receipt), and
-- when the owner later deleted or replaced that entry the shared object would be
-- removed from under the legitimate one.
--
-- 1) Strict shape: {org_id}/receipts/{uuid}.{jpg|png|webp|pdf}, the exact path the
--    server builds. (The older check still bans '..' and other prefixes.)
alter table public.finance_entries add constraint finance_entries_receipt_format_check check (
  receipt_path is null or receipt_path ~ (
    '^' || org_id::text || '/receipts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$'
  )
);

-- 2) One entry per receipt object.
create unique index finance_entries_receipt_path_key
  on public.finance_entries (receipt_path) where receipt_path is not null;

-- 3) The object must exist AND be visible to the caller. The lookup runs with the
--    caller's rights, so storage.objects RLS answers "did you upload it, or are you
--    the owner?" (finance_receipts_select). A missing object and one the caller
--    cannot see give the same error, so it is not an existence oracle. It only
--    runs when the path is new or changed, so editing other fields never re-checks.
create function private.finance_entries_receipt_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.receipt_path is not null
     and (tg_op = 'INSERT' or new.receipt_path is distinct from old.receipt_path)
     and not exists (
       select 1 from storage.objects o
        where o.bucket_id = 'finance-receipts' and o.name = new.receipt_path
     ) then
    raise exception 'receipt not found' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.finance_entries_receipt_guard() from public, anon, authenticated;
create trigger finance_entries_receipt_guard before insert or update on public.finance_entries
  for each row execute function private.finance_entries_receipt_guard();

-- ─── Delete an entry with the costs linked to it, atomically ────────────────
-- Deleting a rental used to leave its commission and cleaning behind as loose
-- expenses (related_entry_id is set null). For a rental registered by mistake that
-- distorts the month, so the app deletes the entry and its linked costs together.
-- SECURITY INVOKER: RLS decides what can be deleted (the owner: everything; staff:
-- only rows they created). Returns the receipt paths of every deleted row so the
-- caller can remove the files; raises 42501, rolling everything back, when the
-- entry itself was not deleted (missing, or not the caller's).
create function public.delete_finance_entry(p_entry_id uuid)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  v_costs text[];
  v_entry text[];
  v_count integer;
begin
  with gone as (
    delete from public.finance_entries c where c.related_entry_id = p_entry_id returning c.receipt_path
  )
  select coalesce(array_agg(receipt_path) filter (where receipt_path is not null), '{}') into v_costs from gone;

  with gone as (
    delete from public.finance_entries e where e.id = p_entry_id returning e.receipt_path
  )
  select count(*)::integer, coalesce(array_agg(receipt_path) filter (where receipt_path is not null), '{}')
    into v_count, v_entry from gone;

  if v_count = 0 then
    raise exception 'entry not found' using errcode = '42501';
  end if;
  return v_costs || v_entry;
end;
$$;
revoke execute on function public.delete_finance_entry(uuid) from public, anon;
grant execute on function public.delete_finance_entry(uuid) to authenticated;
