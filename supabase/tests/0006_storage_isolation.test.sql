-- SD-202: storage.objects policies for the property-photos bucket. Objects
-- live under `{org_id}/...`; only members of that org may write there.
-- Fixed ids from supabase/seed.sql: Saywa org bf88f504-..., Demo org
-- ff24bacc-...; owners a3b45db1-... (Saywa) and bd6a1c86-... (Demo).
begin;
select plan(10);

-- storage.protect_delete blocks raw DELETEs unless the Storage API flag is set;
-- the API sets it, so set it here to exercise the delete policy itself.
select set_config('storage.allow_delete_query', 'true', true);

-- Bucket as code (migration, not just seed).
select is(
  (select file_size_limit from storage.buckets where id = 'property-photos'),
  5242880::bigint,
  'property-photos bucket enforces a 5 MB limit'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'property-photos'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'property-photos bucket only accepts jpeg/png/webp (no SVG)'
);

-- Legacy (non-uuid) prefixes resolve to no org instead of raising.
select is(private.storage_path_org('site/foto1.jpeg'), null::uuid, 'legacy path has no org');
select is(
  private.storage_path_org('bf88f504-051f-4fdc-ab73-4fa12d715817/site/a.jpg'),
  'bf88f504-051f-4fdc-ab73-4fa12d715817'::uuid,
  'org prefix is parsed from the first path segment'
);

-- Fixture written as the table owner (bypasses RLS): one Demo-owned object.
insert into storage.objects (bucket_id, name)
values ('property-photos', 'ff24bacc-47d2-40bc-9210-f860e98892fd/site/demo-fixture.jpg');

-- ─── Saywa owner ────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
set local role authenticated;

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('property-photos', 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/new.jpg')$$,
  'Member can upload under their own org prefix'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('property-photos', 'ff24bacc-47d2-40bc-9210-f860e98892fd/site/evil.jpg')$$,
  '42501',
  null,
  'Member cannot upload under another org''s prefix'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('property-photos', 'site/legacy.jpg')$$,
  '42501',
  null,
  'Member cannot write to a legacy unprefixed path'
);

delete from storage.objects
where bucket_id = 'property-photos'
  and name = 'ff24bacc-47d2-40bc-9210-f860e98892fd/site/demo-fixture.jpg';
reset role;
select ok(
  exists(select 1 from storage.objects
         where name = 'ff24bacc-47d2-40bc-9210-f860e98892fd/site/demo-fixture.jpg'),
  'Member DELETE on another org''s object affects 0 rows'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3b45db1-7c15-4528-a4ba-be625665fb6d"}', true);
delete from storage.objects
where bucket_id = 'property-photos'
  and name = 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/new.jpg';
reset role;
select ok(
  not exists(select 1 from storage.objects
             where name = 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/new.jpg'),
  'Member can delete an object under their own org prefix'
);

-- ─── anon ───────────────────────────────────────────────────────────────────
set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('property-photos', 'bf88f504-051f-4fdc-ab73-4fa12d715817/site/anon.jpg')$$,
  '42501',
  null,
  'anon cannot upload'
);

select * from finish();
rollback;
