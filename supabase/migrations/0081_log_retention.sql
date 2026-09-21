-- ============================================================================
-- 0081_log_retention
-- `activity_logs` (the human-readable feed) and `audit_logs` (the accountable
-- record) have grown without bound since 0010, and every list page counts them
-- exactly. Bound them by age:
--
--   activity_logs : 90 days
--   audit_logs    : 365 days
--
-- Both stay append-only for every caller. The only way a row leaves is the
-- purge below, and the trigger admits it only when BOTH hold:
--   1. the transaction-local GUC `app.purging_logs` is 'on' — set solely inside
--      app.purge_expired_logs(), and rolled back with the transaction; and
--   2. the row is already older than its table's retention.
-- So even a hand-set GUC cannot delete a recent row, and UPDATE is still
-- refused outright (same shape as the delete_item exemption in 0073).
--
-- No pg_cron (see 0047): every insert into either table sweeps opportunistically
-- on ~2% of statements, a bounded batch per run. Retention is therefore a
-- ceiling on growth, not an exact cut-off — a row can outlive it until the next
-- sweep. Run `select app.purge_expired_logs(10000);` as the owner to clear an
-- existing backlog in one go.
--
-- Recovery: a purge is permanent. Undoing one means restoring the database.
-- ============================================================================

-- Single source of truth for how long each log is kept.
create or replace function app.log_retention(p_table text)
returns interval
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  return case p_table
    when 'activity_logs' then interval '90 days'
    when 'audit_logs'    then interval '365 days'
    else null
  end;
end;
$$;

-- Replaces app.reject_mutation() on the two log tables only.
create or replace function app.reject_log_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE'
     and current_setting('app.purging_logs', true) = 'on'
     and old.created_at < now() - app.log_retention(tg_table_name)
  then
    return old;
  end if;

  raise exception 'Table %.% is append-only', tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists activity_logs_no_change on activity_logs;
create trigger activity_logs_no_change
  before update or delete on activity_logs
  for each row execute function app.reject_log_mutation();

drop trigger if exists audit_logs_no_change on audit_logs;
create trigger audit_logs_no_change
  before update or delete on audit_logs
  for each row execute function app.reject_log_mutation();

-- Deletes expired rows, at most p_batch per table, oldest first. Rows another
-- transaction holds are skipped rather than waited on.
create or replace function app.purge_expired_logs(p_batch integer default 2000)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch    integer := least(greatest(coalesce(p_batch, 2000), 1), 10000);
  v_activity integer;
  v_audit    integer;
begin
  perform set_config('app.purging_logs', 'on', true);

  delete from activity_logs
  where id in (
    select id from activity_logs
    where created_at < now() - app.log_retention('activity_logs')
    order by created_at
    limit v_batch
    for update skip locked
  );
  get diagnostics v_activity = row_count;

  delete from audit_logs
  where id in (
    select id from audit_logs
    where created_at < now() - app.log_retention('audit_logs')
    order by created_at
    limit v_batch
    for update skip locked
  );
  get diagnostics v_audit = row_count;

  perform set_config('app.purging_logs', '', true);

  return jsonb_build_object('activity', v_activity, 'audit', v_audit);
end;
$$;

create or replace function app.sweep_expired_logs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if random() < 0.02 then
    perform app.purge_expired_logs();
  end if;
  return null;
end;
$$;

drop trigger if exists activity_logs_sweep on activity_logs;
create trigger activity_logs_sweep
  after insert on activity_logs
  for each statement execute function app.sweep_expired_logs();

drop trigger if exists audit_logs_sweep on audit_logs;
create trigger audit_logs_sweep
  after insert on audit_logs
  for each statement execute function app.sweep_expired_logs();

revoke all on function app.purge_expired_logs(integer)
  from public, anon, authenticated;
grant execute on function app.purge_expired_logs(integer) to service_role;
revoke all on function app.sweep_expired_logs()
  from public, anon, authenticated;
