-- ============================================================================
-- 0027_cash_rls
-- Row Level Security for the Company Cash tables. SELECT only, Super Admin only —
-- members have no visibility into company finances. Every write goes through the
-- SECURITY DEFINER RPCs in 0026. service_role bypasses RLS (seed script).
-- ============================================================================

alter table cash_account enable row level security;
alter table cash_entries enable row level security;

revoke all on table cash_account from authenticated, anon;
grant select on table cash_account to authenticated;

create policy cash_account_admin_select on cash_account
  for select to authenticated
  using (app.is_super_admin());

revoke all on table cash_entries from authenticated, anon;
grant select on table cash_entries to authenticated;

create policy cash_entries_admin_select on cash_entries
  for select to authenticated
  using (app.is_super_admin());
