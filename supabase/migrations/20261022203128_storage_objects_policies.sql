-- SD-202 (moved from SD-102): Storage RLS for the public `property-photos`
-- bucket. Objects live under `{org_id}/...`; only members of that org can
-- write. Reads of the public bucket go through /object/public and need no
-- policy; the select policy below only lets members list/upsert their own
-- prefix. Existing legacy paths (`site/...`, `rooms/...`) have no uuid first
-- segment, so nobody can write them through the API: they stay readable and
-- are moved by scripts/migrate-photo-paths.mjs.

-- Bucket as code (before, only seed.sql / a manual step created it).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-photos', 'property-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Org that owns an object path; null when the first segment is not a uuid.
-- Written with CASE because Postgres does not guarantee AND short-circuiting
-- and a bare ::uuid cast on a legacy path would raise instead of denying.
create or replace function private.storage_path_org(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when (storage.foldername(object_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(object_name))[1])::uuid
  end
$$;

grant execute on function private.storage_path_org(text) to authenticated;

create policy "property_photos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'property-photos'
         and private.is_member(private.storage_path_org(name)));

create policy "property_photos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'property-photos'
              and private.is_member(private.storage_path_org(name)));

create policy "property_photos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'property-photos'
         and private.is_member(private.storage_path_org(name)))
  with check (bucket_id = 'property-photos'
              and private.is_member(private.storage_path_org(name)));

create policy "property_photos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'property-photos'
         and private.is_member(private.storage_path_org(name)));
