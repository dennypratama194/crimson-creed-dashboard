-- ============================================================================
-- 0047_auth_throttle_gc
-- `auth_throttle` (0022) only ever loses rows on a successful sign-in
-- (clear_auth_throttle). Every unique IP / username that ever hit a limited
-- endpoint leaves a row behind forever. Rows are tiny, but there is no reason
-- to keep a counter whose window closed hours ago.
--
-- No pg_cron dependency: hit_auth_throttle sweeps opportunistically on ~1% of
-- calls, deleting counters that are well past their window and not actively
-- blocking. The body is otherwise identical to 0022.
-- ============================================================================

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
  -- Opportunistic garbage collection. Cheap on average, keeps the table from
  -- growing without bound between deploys.
  if random() < 0.01 then
    delete from auth_throttle
    where (blocked_until is null or blocked_until < now_ts - interval '1 hour')
      and first_attempt_at < now_ts - interval '1 hour';
  end if;

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

revoke all on function hit_auth_throttle(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function hit_auth_throttle(text, integer, integer, integer)
  to service_role;
