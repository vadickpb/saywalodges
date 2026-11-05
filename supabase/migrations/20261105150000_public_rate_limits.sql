-- SD-409: request-rate limiting for the public guest actions (quote, checkout, voucher).
-- Fixed-window counters keyed by an HMAC of the caller (computed server-side), so the table never stores an IP or email.
-- Rollback: drop function public.check_public_rate_limit(text,text,integer,integer); drop table public.public_rate_limits;
begin;

create table public.public_rate_limits (
  scope text not null check (scope in ('quote','checkout','voucher')),
  key_hash text not null check (char_length(key_hash) between 32 and 128),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (scope, key_hash, window_start)
);
create index public_rate_limits_window_idx on public.public_rate_limits (window_start);
alter table public.public_rate_limits enable row level security;
revoke all on public.public_rate_limits from public, anon, authenticated;

-- Counts one request and answers whether it is still within the limit. The scope is a closed list and every number is bounded,
-- so a direct anonymous caller cannot create unbounded keys per call; stale windows are purged opportunistically.
-- Residual risk (documented in docs/cron.md): a direct caller can still add rows with random keys; that is the same cost as
-- spamming the public site and the 2-day purge bounds it.
create function public.check_public_rate_limit(p_scope text, p_key_hash text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_hits integer;
begin
  if p_scope is null or p_scope not in ('quote','checkout','voucher')
    or p_key_hash is null or char_length(p_key_hash) not between 32 and 128
    or p_limit is null or p_limit not between 1 and 1000
    or p_window_seconds is null or p_window_seconds not between 10 and 86400 then
    raise exception 'invalid rate limit input' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into public.public_rate_limits as r (scope, key_hash, window_start, hits)
    values (p_scope, p_key_hash, v_start, 1)
    on conflict (scope, key_hash, window_start) do update set hits = r.hits + 1
    returning r.hits into v_hits;
  if random() < 0.02 then
    delete from public.public_rate_limits where window_start < clock_timestamp() - interval '2 days';
  end if;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.check_public_rate_limit(text,text,integer,integer) from public;
grant execute on function public.check_public_rate_limit(text,text,integer,integer) to anon, authenticated, service_role;

commit;
