-- PP-08/09: additive private guide and public hero media. No existing data changes.
create table public.house_guides (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null unique references public.organizations(id) on delete cascade,
 draft jsonb not null, published jsonb,
 version integer not null default 1 check(version > 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(jsonb_typeof(draft) = 'object'), check(published is null or jsonb_typeof(published) = 'object')
);
create table public.house_guide_images (
 id uuid primary key, org_id uuid not null references public.organizations(id) on delete cascade,
 storage_path text not null unique, created_at timestamptz not null default now(),
 check(storage_path ~ ('^' || org_id::text || '/' || id::text || '\.(jpg|png|webp)$'))
);
create index house_guide_images_org_idx on public.house_guide_images(org_id);
create table public.house_guide_links (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
 label text not null check(length(label) between 1 and 100),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 password_hash text not null, expires_at timestamptz not null, revoked_at timestamptz,
 failed_attempts integer not null default 0, total_attempts integer not null default 0, attempt_window timestamptz not null default now(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index house_guide_links_org_idx on public.house_guide_links(org_id);
create table private.house_guide_sessions (
 session_hash text primary key check(session_hash ~ '^[a-f0-9]{64}$'),
 org_id uuid not null references public.organizations(id) on delete cascade,
 link_id uuid not null references public.house_guide_links(id) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index house_guide_sessions_link_idx on private.house_guide_sessions(link_id);
create index house_guide_sessions_org_idx on private.house_guide_sessions(org_id);
create table public.property_hero_media (
 org_id uuid primary key references public.organizations(id) on delete cascade,
 mode text not null default 'photo' check(mode in ('photo','video')),
 video_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(video_path is null or video_path ~ ('^' || org_id::text || '/hero/[a-f0-9-]{36}\.mp4$')),
 check(mode = 'photo' or video_path is not null)
);
alter table public.house_guides enable row level security;
alter table public.house_guide_images enable row level security;
alter table public.house_guide_links enable row level security;
alter table private.house_guide_sessions enable row level security;
alter table public.property_hero_media enable row level security;
revoke all on public.house_guides, public.house_guide_images, public.house_guide_links, public.property_hero_media from anon, authenticated;
revoke all on private.house_guide_sessions from public, anon, authenticated;
grant select on public.house_guides, public.house_guide_links to authenticated;
grant select, insert on public.house_guide_images to authenticated;
grant select on public.property_hero_media to anon, authenticated;
-- Writes to guide/publication and video config only through scoped RPCs.
create policy house_guides_owner_read on public.house_guides for select to authenticated using(private.is_owner(org_id));
create policy house_guide_links_owner_read on public.house_guide_links for select to authenticated using(private.is_owner(org_id));
create policy house_guide_images_owner_read on public.house_guide_images for select to authenticated using(private.is_owner(org_id));
create policy house_guide_images_owner_insert on public.house_guide_images for insert to authenticated with check(private.is_owner(org_id));
create policy property_hero_media_read on public.property_hero_media for select to anon, authenticated using(true);

create function private.valid_house_guide(doc jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare s jsonb; im jsonb; step jsonb; ids text[] := '{}';
begin
 if doc is null or jsonb_typeof(doc) <> 'object' or octet_length(doc::text)>600000
 or jsonb_typeof(doc->'title') is distinct from 'string' or length(btrim(doc->>'title')) not between 1 and 160
 or jsonb_typeof(doc->'sections') is distinct from 'array' then return false; end if;
 if jsonb_array_length(doc->'sections') not between 0 and 30 then return false; end if;
 if exists(select 1 from jsonb_object_keys(doc) k where k not in ('title','sections')) then return false; end if;
 for s in select value from jsonb_array_elements(doc->'sections') loop
  if jsonb_typeof(s) <> 'object' or coalesce(s->>'id','') !~ '^[a-f0-9-]{36}$'
   or (s->>'id') = any(ids) or jsonb_typeof(s->'title') is distinct from 'string'
   or length(btrim(s->>'title')) not between 1 and 160 or jsonb_typeof(s->'text') is distinct from 'string'
   or length(s->>'text')>12000 or jsonb_typeof(s->'visible') is distinct from 'boolean'
   or jsonb_typeof(s->'steps') is distinct from 'array' or jsonb_typeof(s->'images') is distinct from 'array' then return false; end if;
  if exists(select 1 from jsonb_object_keys(s) k where k not in ('id','title','text','visible','steps','images')) then return false; end if;
  ids := array_append(ids,s->>'id');
  if jsonb_array_length(s->'steps')>30 or jsonb_array_length(s->'images')>12 then return false; end if;
  for step in select value from jsonb_array_elements(s->'steps') loop
   if jsonb_typeof(step)<>'string' or length(btrim(step#>>'{}')) not between 1 and 1200 then return false; end if;
  end loop;
  for im in select value from jsonb_array_elements(s->'images') loop
   if jsonb_typeof(im)<>'object' or coalesce(im->>'id','') !~ '^[a-f0-9-]{36}$'
    or jsonb_typeof(im->'alt') is distinct from 'string' or length(btrim(im->>'alt')) not between 1 and 240
    or jsonb_typeof(im->'caption') is distinct from 'string' or length(im->>'caption')>500 then return false; end if;
   if exists(select 1 from jsonb_object_keys(im) k where k not in ('id','alt','caption')) then return false; end if;
  end loop;
 end loop;
 return true;
end $$;

create function public.save_house_guide(p_org_id uuid,p_content jsonb,p_version integer,p_publish boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer; missing boolean;
begin
 if not coalesce(private.is_owner(p_org_id),false) then raise exception 'not allowed' using errcode='42501'; end if;
 if p_version is null or p_version<0 or p_publish is null then raise exception 'invalid version' using errcode='22023'; end if;
 if not private.valid_house_guide(p_content) then raise exception 'invalid guide' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org_id::text,8108));
 select version into v from public.house_guides where org_id=p_org_id for update;
 if coalesce(v,0) <> p_version then raise exception 'version conflict' using errcode='40001'; end if;
 select exists(select 1 from jsonb_array_elements(p_content->'sections') s,
  jsonb_array_elements(s->'images') im where not exists(select 1 from public.house_guide_images i
  where i.org_id=p_org_id and i.id::text=im->>'id')) into missing;
 if missing then raise exception 'invalid image' using errcode='22023'; end if;
 insert into public.house_guides(org_id,draft,published,version) values(p_org_id,p_content,case when p_publish then p_content end,1)
 on conflict(org_id) do update set draft=p_content,published=case when p_publish then p_content else house_guides.published end,
 version=house_guides.version+1,updated_at=now() returning version into v;
 return v;
end $$;

create function public.create_house_guide_link(p_org_id uuid,p_label text,p_token_hash text,p_password text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if not coalesce(private.is_owner(p_org_id),false) then raise exception 'not allowed' using errcode='42501'; end if;
 if p_password is null or length(p_password)<12 or octet_length(p_password)>72 or p_token_hash is null
 or p_token_hash !~ '^[a-f0-9]{64}$' or p_label is null or length(btrim(p_label)) not between 1 and 100
 or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '365 days' then raise exception 'invalid link' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org_id::text,8108));
 if not exists(select 1 from public.house_guides where org_id=p_org_id and published is not null) then raise exception 'publish first' using errcode='22023'; end if;
 if (select count(*) from public.house_guide_links where org_id=p_org_id and revoked_at is null and expires_at>now())>=50 then raise exception 'link limit' using errcode='22023'; end if;
 insert into public.house_guide_links(org_id,label,token_hash,password_hash,expires_at)
 values(p_org_id,btrim(p_label),p_token_hash,extensions.crypt(p_password,extensions.gen_salt('bf',10)),p_expires_at) returning id into result;
 return result;
end $$;

create function public.revoke_house_guide_link(p_org_id uuid,p_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(private.is_owner(p_org_id),false) then raise exception 'not allowed' using errcode='42501'; end if;
 update public.house_guide_links set revoked_at=now(),updated_at=now() where org_id=p_org_id and id=p_id;
 return found;
end $$;

-- Failed attempts persist across server instances; row lock serializes attempts.
create function public.unlock_house_guide(p_host text,p_token_hash text,p_password text,p_session_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.house_guide_links;
begin
 if p_host is null or length(p_host)>255 or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
 or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' or p_password is null
 or length(p_password)<12 or octet_length(p_password)>72 then return false; end if;
 select gl.* into l from public.house_guide_links gl join public.properties p on p.org_id=gl.org_id
 where gl.token_hash=p_token_hash and (p.subdomain=p_host or p.custom_domain=p_host)
 and gl.revoked_at is null and gl.expires_at>now() for update of gl;
 if not found then return false; end if;
 if l.attempt_window < now()-interval '15 minutes' then
  update public.house_guide_links set failed_attempts=0,total_attempts=0,attempt_window=now() where id=l.id;
  l.failed_attempts:=0; l.total_attempts:=0;
 end if;
 if l.failed_attempts>=10 or l.total_attempts>=50 then return false; end if;
 delete from private.house_guide_sessions where link_id=l.id and expires_at<=now();
 if (select count(*) from private.house_guide_sessions where link_id=l.id)>=100 then return false; end if;
 update public.house_guide_links set total_attempts=total_attempts+1 where id=l.id;
 if extensions.crypt(p_password,l.password_hash) is distinct from l.password_hash then
  update public.house_guide_links set failed_attempts=failed_attempts+1 where id=l.id;
  return false;
 end if;
 delete from private.house_guide_sessions where link_id=l.id and expires_at<=now();
 insert into private.house_guide_sessions(session_hash,org_id,link_id,expires_at)
 values(p_session_hash,l.org_id,l.id,least(l.expires_at,now()+interval '1 day')) on conflict do nothing;
 return found;
end $$;

create function public.read_house_guide(p_host text,p_token_hash text,p_session_hash text) returns jsonb
language sql security definer stable set search_path = '' as $$
 select jsonb_build_object('title',g.published->'title','sections',coalesce((select jsonb_agg(s) from jsonb_array_elements(g.published->'sections') s where s->>'visible'='true'),'[]'::jsonb))
 from public.house_guides g join public.house_guide_links l on l.org_id=g.org_id
 join private.house_guide_sessions ss on ss.link_id=l.id and ss.org_id=l.org_id
 join public.properties p on p.org_id=g.org_id
 where ss.session_hash=p_session_hash and l.token_hash=p_token_hash and ss.expires_at>now()
 and l.expires_at>now() and l.revoked_at is null and g.published is not null
 and (p.subdomain=p_host or p.custom_domain=p_host)
$$;

-- Storage download must present a valid session AND reference a visible published image.
create function private.can_read_house_guide_image(object_name text) returns boolean
language sql security definer stable set search_path = '' as $$
 select exists(select 1 from public.house_guide_images i
 join public.house_guides g on g.org_id=i.org_id
 join public.house_guide_links l on l.org_id=i.org_id
 join private.house_guide_sessions ss on ss.link_id=l.id and ss.org_id=i.org_id
 where i.storage_path=object_name and ss.session_hash=(coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-guide-session')
 and ss.expires_at>now() and l.expires_at>now() and l.revoked_at is null
 and exists(select 1 from jsonb_array_elements(g.published->'sections') s,
 jsonb_array_elements(s->'images') im where s->>'visible'='true' and im->>'id'=i.id::text))
$$;
revoke all on function private.can_read_house_guide_image(text) from public;
grant execute on function private.can_read_house_guide_image(text) to anon,authenticated;
create policy house_guide_images_visitor_read on public.house_guide_images for select to anon
using(private.can_read_house_guide_image(storage_path));
grant select(id,org_id,storage_path) on public.house_guide_images to anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('house-guide-images','house-guide-images',false,4194304,array['image/jpeg','image/png','image/webp']),
 ('site-video-uploads','site-video-uploads',false,31457280,array['video/mp4']),
 ('site-videos','site-videos',false,31457280,array['video/mp4']);
create policy house_guide_images_storage_owner on storage.objects for select to authenticated using(bucket_id='house-guide-images' and private.is_owner(private.storage_path_org(name)));
create policy house_guide_images_storage_insert on storage.objects for insert to authenticated with check(bucket_id='house-guide-images' and private.is_owner(private.storage_path_org(name)));
create policy house_guide_images_storage_visitor on storage.objects for select to anon using(bucket_id='house-guide-images' and private.can_read_house_guide_image(name));
create policy site_videos_owner_read on storage.objects for select to authenticated using(bucket_id in ('site-video-uploads','site-videos') and private.is_owner(private.storage_path_org(name)));
create policy site_videos_owner_insert on storage.objects for insert to authenticated with check(bucket_id in ('site-video-uploads','site-videos') and private.is_owner(private.storage_path_org(name)) and name ~ ('^' || private.storage_path_org(name)::text || '/hero/[a-f0-9-]{36}\.mp4$'));
create policy site_video_uploads_owner_delete on storage.objects for delete to authenticated using(bucket_id='site-video-uploads' and private.is_owner(private.storage_path_org(name)));

create table private.verified_hero_videos (
 storage_path text primary key, org_id uuid not null references public.organizations(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index verified_hero_videos_org_idx on private.verified_hero_videos(org_id);
alter table private.verified_hero_videos enable row level security;
revoke all on private.verified_hero_videos from public,anon,authenticated;
create function public.register_verified_hero_video(p_org_id uuid,p_user_id uuid,p_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from public.memberships where org_id=p_org_id and user_id=p_user_id and role='owner')
 then raise exception 'not allowed' using errcode='42501'; end if;
 if p_path is null or p_path !~ ('^' || p_org_id::text || '/hero/[a-f0-9-]{36}\.mp4$')
 or not exists(select 1 from storage.objects where bucket_id='site-videos' and name=p_path) then raise exception 'missing video' using errcode='22023'; end if;
 insert into private.verified_hero_videos(storage_path,org_id) values(p_path,p_org_id) on conflict do nothing;
 return true;
end $$;
revoke all on function public.register_verified_hero_video(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.register_verified_hero_video(uuid,uuid,text) to service_role;
create function private.can_read_hero_video(object_name text) returns boolean language sql security definer stable set search_path = '' as $$
 select exists(select 1 from public.property_hero_media m where m.video_path=object_name and m.mode='video')
$$;
revoke all on function private.can_read_hero_video(text) from public;
grant execute on function private.can_read_hero_video(text) to anon;
create policy site_videos_published_read on storage.objects for select to anon using(bucket_id='site-videos' and private.can_read_hero_video(name));

create function public.save_hero_media(p_org_id uuid,p_mode text,p_video_path text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not coalesce(private.is_owner(p_org_id),false) then raise exception 'not allowed' using errcode='42501'; end if;
 if p_mode is null or p_mode not in ('photo','video') then raise exception 'invalid mode' using errcode='22023'; end if;
 if p_mode='video' and (not exists(select 1 from private.verified_hero_videos where org_id=p_org_id and storage_path=p_video_path)
 or not exists(select 1 from public.photos where org_id=p_org_id and role='hero' and space_id is null)) then raise exception 'video and poster required' using errcode='22023'; end if;
 insert into public.property_hero_media(org_id,mode,video_path) values(p_org_id,p_mode,nullif(p_video_path,''))
 on conflict(org_id) do update set mode=p_mode,video_path=excluded.video_path,updated_at=now();
 return true;
end $$;
revoke all on function public.save_house_guide(uuid,jsonb,integer,boolean),public.create_house_guide_link(uuid,text,text,text,timestamptz),public.revoke_house_guide_link(uuid,uuid),public.save_hero_media(uuid,text,text) from public,anon;
grant execute on function public.save_house_guide(uuid,jsonb,integer,boolean),public.create_house_guide_link(uuid,text,text,text,timestamptz),public.revoke_house_guide_link(uuid,uuid),public.save_hero_media(uuid,text,text) to authenticated;
revoke all on function public.unlock_house_guide(text,text,text,text),public.read_house_guide(text,text,text) from public,anon,authenticated;
grant execute on function public.unlock_house_guide(text,text,text,text),public.read_house_guide(text,text,text) to anon;
revoke all on function private.valid_house_guide(jsonb) from public,anon,authenticated;
