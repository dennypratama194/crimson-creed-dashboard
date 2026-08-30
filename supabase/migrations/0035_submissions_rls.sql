-- ============================================================================
-- 0035_submissions_rls
-- Row Level Security for the Monthly Material Submissions tables (Phase 17).
-- SELECT only — every write goes through the SECURITY DEFINER RPCs in 0034.
-- service_role bypasses RLS (used by the seed script).
-- ============================================================================

alter table submission_material_types   enable row level security;
alter table submission_periods           enable row level security;
alter table submission_period_targets    enable row level security;
alter table member_submissions           enable row level security;
alter table member_submission_lines      enable row level security;

-- ---------------------------------------------------------------------------
-- catalogue + periods + targets  (every active member may read)
-- ---------------------------------------------------------------------------
revoke all on table submission_material_types from authenticated, anon;
grant select on table submission_material_types to authenticated;

create policy submission_material_types_select on submission_material_types
  for select to authenticated
  using (app.is_active_member());

revoke all on table submission_periods from authenticated, anon;
grant select on table submission_periods to authenticated;

create policy submission_periods_select on submission_periods
  for select to authenticated
  using (app.is_active_member());

revoke all on table submission_period_targets from authenticated, anon;
grant select on table submission_period_targets to authenticated;

create policy submission_period_targets_select on submission_period_targets
  for select to authenticated
  using (app.is_active_member());

-- ---------------------------------------------------------------------------
-- member_submissions  (member: own; Super Admin: all)
-- ---------------------------------------------------------------------------
revoke all on table member_submissions from authenticated, anon;
grant select on table member_submissions to authenticated;

create policy member_submissions_select on member_submissions
  for select to authenticated
  using (app.is_super_admin() or member_id = app.current_member_id());

-- ---------------------------------------------------------------------------
-- member_submission_lines  (member: own submission's lines; Super Admin: all)
-- ---------------------------------------------------------------------------
revoke all on table member_submission_lines from authenticated, anon;
grant select on table member_submission_lines to authenticated;

create policy member_submission_lines_select on member_submission_lines
  for select to authenticated
  using (
    app.is_super_admin()
    or exists (
      select 1 from member_submissions s
      where s.id = member_submission_lines.member_submission_id
        and s.member_id = app.current_member_id()
    )
  );
