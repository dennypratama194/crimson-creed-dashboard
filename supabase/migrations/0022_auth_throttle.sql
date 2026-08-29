-- ============================================================================
-- 0022_auth_throttle
-- Sliding-window rate limiting for unauthenticated / pre-session auth endpoints
-- (login, password change). Written only by trusted server code through the
-- SECURITY DEFINER helpers below — never exposed to `anon` or `authenticated`,
-- so a direct PostgREST call cannot inflate or read the table.
-- ============================================================================

create table if not exists auth_throttle (
  key               text primary key,
  attempts          integer not null default 0,
  first_attempt_at  timestamptz not null default now(),
  blocked_until     timestamptz
);

create index if not exists auth_throttle_blocked_until_idx
  on auth_throttle (blocked_until);

comment on table auth_throttle is
  'Rate-limit counters for auth endpoints. Trusted-server-only; see hit_auth_throttle().';

alter table auth_throttle enable row level security;
-- Intentionally no policies: only `service_role` (bypasses RLS) and the
-- SECURITY DEFINER functions below ever touch this table.
revoke all on table auth_throttle from anon, authenticated;

-- ---------------------------------------------------------------------------
-- hit_auth_throttle(key, limit, window_seconds, block_seconds)
-- Records one attempt against `key` and returns the number of seconds the
-- caller must wait before retrying. 0 means the attempt is allowed.
-- ---------------------------------------------------------------------------
create or replace function hit_auth_throttle(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer,
  p_block_seconds  integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r       auth_throttle;
  now_ts  timestamptz := now();
begin
  select * into r from auth_throttle where key = p_key for update;

  if not found then
    insert into auth_throttle (key, attempts, first_attempt_at)
      values (p_key, 1, now_ts);
    return 0;
  end if;

  if r.blocked_until is not null and r.blocked_until > now_ts then
    return ceil(extract(epoch from (r.blocked_until - now_ts)))::integer;
  end if;

  -- Window elapsed since the first attempt in this bucket → start a new one.
  if r.first_attempt_at < now_ts - make_interval(secs => p_window_seconds) then
    update auth_throttle
      set attempts = 1, first_attempt_at = now_ts, blocked_until = null
      where key = p_key;
    return 0;
  end if;

  if r.attempts + 1 > p_limit then
    update auth_throttle
      set attempts = r.attempts + 1,
          blocked_until = now_ts + make_interval(secs => p_block_seconds)
      where key = p_key;
    return p_block_seconds;
  end if;

  update auth_throttle set attempts = r.attempts + 1 where key = p_key;
  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- clear_auth_throttle(key) — called after a successful sign-in so a member who
-- fat-fingered a few times is not left locked out.
-- ---------------------------------------------------------------------------
create or replace function clear_auth_throttle(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth_throttle where key = p_key;
$$;

revoke all on function hit_auth_throttle(text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function clear_auth_throttle(text)
  from public, anon, authenticated;
grant execute on function hit_auth_throttle(text, integer, integer, integer)
  to service_role;
grant execute on function clear_auth_throttle(text) to service_role;
