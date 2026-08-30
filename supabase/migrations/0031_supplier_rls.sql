-- ============================================================================
-- 0031_supplier_rls
-- Row Level Security for the Suppliers module. SELECT only, Super Admin only —
-- members have no visibility into who supplies what, or at what cost. Every
-- write goes through the SECURITY DEFINER RPCs in 0030. service_role bypasses
-- RLS (seed script). Mirrors 0027_cash_rls.sql.
-- ============================================================================

alter table suppliers enable row level security;
alter table supplier_items enable row level security;

revoke all on table suppliers from authenticated, anon;
revoke all on table supplier_items from authenticated, anon;
grant select on table suppliers to authenticated;
grant select on table supplier_items to authenticated;

create policy suppliers_admin_select on suppliers
  for select to authenticated
  using (app.is_super_admin());

create policy supplier_items_admin_select on supplier_items
  for select to authenticated
  using (app.is_super_admin());
