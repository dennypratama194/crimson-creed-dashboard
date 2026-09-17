-- ============================================================================
-- 0078_auth_throttle_concurrency
-- hit_auth_throttle (0022, GC added in 0047) created a bucket with
--   select ... for update;  if not found then insert
-- Two first hits on the same key both found nothing, both inserted, and the
-- loser died on the primary key. The app reads any RPC error as "limiter
-- unavailable" and falls back — to the in-process limiter for sign-in, to
-- allow-all for member actions — so a burst of parallel first attempts was
-- partly counted in memory instead of the shared table.
--
-- Now:
--   1. `insert ... on conflict do nothing` creates the bucket. The unique index
--      makes a concurrent creator wait for the first one instead of failing.
--   2. `select ... for update` then serializes every hit on THAT key only;
--      different keys never share a lock.
--   3. The row can vanish between 1 and 2 (the sweep below, run by another
--      transaction). Loop and re-create it: an expired bucket that was swept is
--      equivalent to a fresh one.
--   4. The sweep runs AFTER this call holds its own key, deletes at most a
--      bounded batch, and uses SKIP LOCKED — so it never waits on a row another
--      hit is using. A transaction therefore only ever waits while it holds
--      nothing, which rules out a lock cycle between two sweeping callers.
--
-- Semantics are unchanged and are a FIXED window anchored at the first hit,
-- not a sliding one (0022's header said "sliding"; it never was): the first hit
-- opens a window of p_window_seconds; up to p_limit hits pass inside it; the
-- next one sets blocked_until = now + p_block_seconds and every hit until then
-- returns the remaining wait without counting. After the window (and any block)
-- has passed, the next hit opens a new window. src/lib/rate-limit-local.ts
-- implements the same rules for the in-process fallback.
--
-- Also pins search_path to `public, pg_temp` on both functions (it was `public`).
-- Signatures and return values are unchanged, so the running app is unaffected.
-- ============================================================================

create or replace function public.hit_auth_throttle(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer,
  p_block_seconds  integer
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        public.auth_throttle;
  now_ts   timestamptz;
  created  boolean := false;
  attempts integer := 0;
begin
  if p_key is null or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1
     or p_block_seconds is null or p_block_seconds < 1 then
    raise exception 'hit_auth_throttle: key, limit, window and block are required'
      using errcode = 'check_violation';
  end if;

  loop
    attempts := attempts + 1;

    insert into public.auth_throttle as t (key, attempts, first_attempt_at)
    values (p_key, 1, clock_timestamp())
    on conflict (key) do nothing
    returning t.* into r;

    if found then
      created := true;
      exit;
    end if;

    select * into r from public.auth_throttle where key = p_key for update;
    exit when found;

    -- Swept between the insert and the lock. Twice in a row would need the
    -- sweep to win two consecutive races on one key; give up loudly rather
    -- than spin.
    if attempts >= 3 then
      raise exception 'hit_auth_throttle: could not lock bucket %', p_key;
    end if;
  end loop;

  -- Read the clock only once the bucket is ours: a hit that waited on the lock
  -- must not judge the window by the moment it started waiting.
  now_ts := clock_timestamp();

  if not created then
    if r.blocked_until is not null and r.blocked_until > now_ts then
      return greatest(1, ceil(extract(epoch from (r.blocked_until - now_ts))))::integer;
    end if;

    if r.first_attempt_at < now_ts - make_interval(secs => p_window_seconds) then
      update public.auth_throttle
        set attempts = 1, first_attempt_at = now_ts, blocked_until = null
        where key = p_key;
    elsif r.attempts + 1 > p_limit then
      update public.auth_throttle
        set attempts = r.attempts + 1,
            blocked_until = now_ts + make_interval(secs => p_block_seconds)
        where key = p_key;
      return p_block_seconds;
    else
      update public.auth_throttle set attempts = r.attempts + 1 where key = p_key;
    end if;
  end if;

  -- Opportunistic garbage collection, after our own key is held (see header).
  if random() < 0.01 then
    delete from public.auth_throttle t
    using (
      select s.key
      from public.auth_throttle s
      where s.key <> p_key
        and (s.blocked_until is null or s.blocked_until < now_ts - interval '1 hour')
        and s.first_attempt_at < now_ts - interval '1 hour'
      limit 500
      for update skip locked
    ) stale
    where t.key = stale.key;
  end if;

  return 0;
end;
$$;

create or replace function public.clear_auth_throttle(p_key text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.auth_throttle where key = p_key;
$$;

revoke all on function public.hit_auth_throttle(text, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.clear_auth_throttle(text)
  from public, anon, authenticated;
grant execute on function public.hit_auth_throttle(text, integer, integer, integer)
  to service_role;
grant execute on function public.clear_auth_throttle(text) to service_role;
