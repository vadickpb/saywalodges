-- PP-10: preserve signatures, grants, bcrypt and all attempt/session limits.
-- Rollback: replace these same functions restoring <12. Existing hashes stay valid;
-- passwords shorter than 12 will no longer unlock until this change is reapplied.

create or replace function public.create_house_guide_link(p_org_id uuid,p_label text,p_token_hash text,p_password text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if not coalesce(private.is_owner(p_org_id),false) then raise exception 'not allowed' using errcode='42501'; end if;
 if p_password is null or length(p_password)<6 or octet_length(p_password)>72 or p_token_hash is null
 or p_token_hash !~ '^[a-f0-9]{64}$' or p_label is null or length(btrim(p_label)) not between 1 and 100
 or p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '365 days' then raise exception 'invalid link' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org_id::text,8108));
 if not exists(select 1 from public.house_guides where org_id=p_org_id and published is not null) then raise exception 'publish first' using errcode='22023'; end if;
 if (select count(*) from public.house_guide_links where org_id=p_org_id and revoked_at is null and expires_at>now())>=50 then raise exception 'link limit' using errcode='22023'; end if;
 insert into public.house_guide_links(org_id,label,token_hash,password_hash,expires_at)
 values(p_org_id,btrim(p_label),p_token_hash,extensions.crypt(p_password,extensions.gen_salt('bf',10)),p_expires_at) returning id into result;
 return result;
end $$;

create or replace function public.unlock_house_guide(p_host text,p_token_hash text,p_password text,p_session_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l public.house_guide_links;
begin
 if p_host is null or length(p_host)>255 or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
 or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' or p_password is null
 or length(p_password)<6 or octet_length(p_password)>72 then return false; end if;
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
