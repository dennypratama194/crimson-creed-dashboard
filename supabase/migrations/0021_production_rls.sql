-- ============================================================================
-- 0021_production_rls
-- Row Level Security for the Production & Payroll tables. SELECT only —
-- every write goes through the SECURITY DEFINER RPCs in 0020. service_role
-- bypasses RLS (used by the seed script).
-- ============================================================================

alter table production_rates   enable row level security;
alter table production_logs     enable row level security;
alter table payroll_runs        enable row level security;
alter table payroll_run_lines   enable row level security;

-- ---------------------------------------------------------------------------
-- production_rates  (every active member may read rates; writes via RPC)
-- ---------------------------------------------------------------------------
revoke all on table production_rates from authenticated, anon;
grant select on table production_rates to authenticated;

create policy production_rates_select on production_rates
  for select to authenticated
  using (app.is_active_member());

-- ---------------------------------------------------------------------------
-- production_logs  (member: own; Super Admin: all)
-- ---------------------------------------------------------------------------
revoke all on table production_logs from authenticated, anon;
grant select on table production_logs to authenticated;

create policy production_logs_select on production_logs
  for select to authenticated
  using (app.is_super_admin() or member_id = app.current_member_id());

-- ---------------------------------------------------------------------------
-- payroll_runs  (Super Admin: all; member: runs they have a line in)
-- ---------------------------------------------------------------------------
revoke all on table payroll_runs from authenticated, anon;
grant select on table payroll_runs to authenticated;

create policy payroll_runs_select on payroll_runs
  for select to authenticated
  using (
    app.is_super_admin()
    or exists (
      select 1 from payroll_run_lines l
      where l.payroll_run_id = payroll_runs.id
        and l.member_id = app.current_member_id()
    )
  );

-- ---------------------------------------------------------------------------
-- payroll_run_lines  (member: own lines; Super Admin: all)
-- ---------------------------------------------------------------------------
revoke all on table payroll_run_lines from authenticated, anon;
grant select on table payroll_run_lines to authenticated;

create policy payroll_run_lines_select on payroll_run_lines
  for select to authenticated
  using (app.is_super_admin() or member_id = app.current_member_id());
