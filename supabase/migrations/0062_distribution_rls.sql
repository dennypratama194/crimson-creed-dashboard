-- ============================================================================
-- 0062_distribution_rls
-- Row Level Security for the Phase 19 tables. SELECT only — every write goes
-- through the SECURITY DEFINER RPCs in 0061. service_role bypasses RLS (used
-- by the seed script).
--
-- A member sees only rows addressed to them. An unassigned member gets an
-- empty list, which is the whole point of the read-only member view.
-- ============================================================================

alter table distribution_rates     enable row level security;
alter table distributions          enable row level security;
alter table production_assignments enable row level security;

-- ---------------------------------------------------------------------------
-- distribution_rates  (Super Admin only — the company cut is not member-facing,
-- and rates hang off stash items members cannot read anyway. A member reads the
-- rate that applied to them from the snapshot on their own distribution row.)
-- ---------------------------------------------------------------------------
revoke all on table distribution_rates from authenticated, anon;
grant select on table distribution_rates to authenticated;

create policy distribution_rates_select on distribution_rates
  for select to authenticated
  using (app.is_super_admin());

-- ---------------------------------------------------------------------------
-- distributions  (member: own; Super Admin: all)
-- ---------------------------------------------------------------------------
revoke all on table distributions from authenticated, anon;
grant select on table distributions to authenticated;

create policy distributions_select on distributions
  for select to authenticated
  using (app.is_super_admin() or member_id = app.current_member_id());

-- ---------------------------------------------------------------------------
-- production_assignments  (member: own; Super Admin: all)
-- ---------------------------------------------------------------------------
revoke all on table production_assignments from authenticated, anon;
grant select on table production_assignments to authenticated;

create policy production_assignments_select on production_assignments
  for select to authenticated
  using (app.is_super_admin() or member_id = app.current_member_id());
