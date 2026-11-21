-- SD-1130: the owner's message library and the house data the messages are filled with.
--  * message_templates: one row per (organization, key) only once the owner customizes a message; without a row the app uses its
--    built-in text (so a new installation works at once and "Restaurar" simply deletes the row). Keys are the fixed moments of a stay
--    (confirmation, before arrival, arrival day, welcome, house rules, before departure, farewell) plus custom_1..custom_6.
--    Each message has a Spanish and an English body, and an optional "when it is due": an anchor (check-in / check-out) and a number
--    of days before (negative) or after (positive) it.
--  * message_house_info: one row per organization with what the messages mention: check-in / check-out time, Wi-Fi, door code,
--    location link, a contact number and the house rules (es/en). Sensitive values (Wi-Fi password, door code) are only filled in
--    a message close to the arrival: the app renders them only inside [check-in - 2 days, check-out] AND the server sends them to
--    the browser only for stays inside that window. Members can still read the table with their own session (they send the
--    messages); this is "do not travel early", not a secret from the team.
--  * No insert/update/delete policies on purpose: every write goes through the owner-only RPCs and the tables have no write grants.
--  * Members read (RLS); only the OWNER writes, through the RPCs below.
-- Additive. Rollback: drop function public.save_message_template(...), public.delete_message_template(uuid,text),
--   public.save_message_house_info(...); drop table public.message_templates, public.message_house_info;
begin;

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key in ('confirmation', 'before_arrival', 'arrival_day', 'welcome', 'house_rules', 'before_departure', 'farewell')
    or key ~ '^custom_[1-6]$'),
  title text not null check (char_length(title) between 1 and 80),
  body_es text not null check (char_length(body_es) between 1 and 2000),
  body_en text not null check (char_length(body_en) between 1 and 2000),
  anchor text check (anchor is null or anchor in ('check_in', 'check_out')),
  offset_days smallint check (offset_days is null or offset_days between -30 and 30),
  updated_at timestamptz not null default now(),
  constraint message_templates_org_key_key unique (org_id, key),
  constraint message_templates_when_check check ((anchor is null) = (offset_days is null))
);
create index message_templates_org_id_idx on public.message_templates(org_id);
alter table public.message_templates enable row level security;
create policy message_templates_select on public.message_templates for select to authenticated using (private.is_member(org_id));
revoke all on public.message_templates from public, anon, authenticated;
grant select on public.message_templates to authenticated;
grant all on public.message_templates to service_role;

create table public.message_house_info (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  checkin_time text check (checkin_time is null or checkin_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  checkout_time text check (checkout_time is null or checkout_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  wifi_name text check (wifi_name is null or char_length(wifi_name) between 1 and 100),
  wifi_password text check (wifi_password is null or char_length(wifi_password) between 1 and 100),
  door_code text check (door_code is null or char_length(door_code) between 1 and 40),
  location_url text check (location_url is null or (char_length(location_url) <= 500 and location_url ~ '^https://[^[:space:]]+$')),
  contact_phone text check (contact_phone is null or (char_length(contact_phone) between 5 and 30 and contact_phone ~ '^[0-9+() -]+$')),
  rules_es text check (rules_es is null or char_length(rules_es) <= 3000),
  rules_en text check (rules_en is null or char_length(rules_en) <= 3000),
  updated_at timestamptz not null default now()
);
alter table public.message_house_info enable row level security;
create policy message_house_info_select on public.message_house_info for select to authenticated using (private.is_member(org_id));
revoke all on public.message_house_info from public, anon, authenticated;
grant select on public.message_house_info to authenticated;
grant all on public.message_house_info to service_role;

-- Control characters other than line breaks and tabs are never part of a message.
create function private.message_text_ok(p_text text) returns boolean
language sql immutable set search_path = '' as $$
  select p_text !~ U&'[\0001-\0008\000b\000c\000e-\001f\007f-\009f\200b-\200f\2028\2029\202a-\202e\2060-\2064\2066-\206f\feff]'
$$;
revoke all on function private.message_text_ok(text) from public, anon, authenticated;

create function public.save_message_template(
  p_org_id uuid, p_key text, p_title text, p_body_es text, p_body_en text, p_anchor text, p_offset integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_title text := btrim(p_title);
  v_es text := btrim(p_body_es);
  v_en text := btrim(p_body_en);
begin
  if p_org_id is null or not private.is_owner(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_key is null or not (p_key in ('confirmation', 'before_arrival', 'arrival_day', 'welcome', 'house_rules', 'before_departure', 'farewell')
        or p_key ~ '^custom_[1-6]$')
     or v_title is null or char_length(v_title) not between 1 and 80
     or v_es is null or char_length(v_es) not between 1 and 2000 or v_en is null or char_length(v_en) not between 1 and 2000
     or not private.message_text_ok(v_title) or not private.message_text_ok(v_es) or not private.message_text_ok(v_en)
     or (p_anchor is null) <> (p_offset is null) or (p_anchor is not null and p_anchor not in ('check_in', 'check_out'))
     or (p_offset is not null and p_offset not between -30 and 30) then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  insert into public.message_templates (org_id, key, title, body_es, body_en, anchor, offset_days)
  values (p_org_id, p_key, v_title, v_es, v_en, p_anchor, p_offset)
  on conflict (org_id, key) do update set title = excluded.title, body_es = excluded.body_es, body_en = excluded.body_en,
    anchor = excluded.anchor, offset_days = excluded.offset_days, updated_at = now();
end;
$$;

-- Back to the built-in text (moments) or removes a custom message.
create function public.delete_message_template(p_org_id uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_org_id is null or not private.is_owner(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.message_templates where org_id = p_org_id and key = p_key;
end;
$$;

create function public.save_message_house_info(
  p_org_id uuid, p_checkin text, p_checkout text, p_wifi_name text, p_wifi_password text, p_door_code text,
  p_location_url text, p_contact_phone text, p_rules_es text, p_rules_en text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_checkin text := nullif(btrim(p_checkin), '');
  v_checkout text := nullif(btrim(p_checkout), '');
  v_wifi text := nullif(btrim(p_wifi_name), '');
  v_pass text := nullif(btrim(p_wifi_password), '');
  v_door text := nullif(btrim(p_door_code), '');
  v_url text := nullif(btrim(p_location_url), '');
  v_phone text := nullif(btrim(p_contact_phone), '');
  v_es text := nullif(btrim(p_rules_es), '');
  v_en text := nullif(btrim(p_rules_en), '');
begin
  if p_org_id is null or not private.is_owner(p_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (v_checkin is not null and v_checkin !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     or (v_checkout is not null and v_checkout !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     or (v_wifi is not null and (char_length(v_wifi) > 100 or not private.message_text_ok(v_wifi)))
     or (v_pass is not null and (char_length(v_pass) > 100 or not private.message_text_ok(v_pass)))
     or (v_door is not null and (char_length(v_door) > 40 or not private.message_text_ok(v_door)))
     or (v_url is not null and (char_length(v_url) > 500 or v_url !~ '^https://[^[:space:]]+$'))
     or (v_phone is not null and (char_length(v_phone) not between 5 and 30 or v_phone !~ '^[0-9+() -]+$'))
     or (v_es is not null and (char_length(v_es) > 3000 or not private.message_text_ok(v_es)))
     or (v_en is not null and (char_length(v_en) > 3000 or not private.message_text_ok(v_en))) then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  insert into public.message_house_info (org_id, checkin_time, checkout_time, wifi_name, wifi_password, door_code, location_url, contact_phone, rules_es, rules_en)
  values (p_org_id, v_checkin, v_checkout, v_wifi, v_pass, v_door, v_url, v_phone, v_es, v_en)
  on conflict (org_id) do update set checkin_time = excluded.checkin_time, checkout_time = excluded.checkout_time, wifi_name = excluded.wifi_name,
    wifi_password = excluded.wifi_password, door_code = excluded.door_code, location_url = excluded.location_url,
    contact_phone = excluded.contact_phone, rules_es = excluded.rules_es, rules_en = excluded.rules_en, updated_at = now();
end;
$$;

revoke all on function public.save_message_template(uuid, text, text, text, text, text, integer),
  public.delete_message_template(uuid, text),
  public.save_message_house_info(uuid, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.save_message_template(uuid, text, text, text, text, text, integer),
  public.delete_message_template(uuid, text),
  public.save_message_house_info(uuid, text, text, text, text, text, text, text, text, text) to authenticated;

commit;
