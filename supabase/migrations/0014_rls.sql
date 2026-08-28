-- ============================================================================
-- 0014_rls
-- Row Level Security. The application connects as `authenticated`; every
-- operational write goes through the SECURITY DEFINER RPCs in 0013, so most
-- tables expose SELECT only. `service_role` (server-side admin client) bypasses
-- RLS and is used for member provisioning / password resets in Phase 2.
-- ============================================================================

-- Anonymous users get nothing in this schema.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
alter table members               enable row level security;
alter table items                 enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table inventory             enable row level security;
alter table inventory_movements   enable row level security;
alter table notifications         enable row level security;
alter table order_timeline        enable row level security;
alter table activity_logs         enable row level security;
alter table audit_logs            enable row level security;
alter table organization_settings enable row level security;

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
revoke all on table members from authenticated;
grant select, insert, update on table members to authenticated;

create policy members_select on members
  for select to authenticated
  using (app.is_super_admin() or user_id = auth.uid());

create policy members_admin_insert on members
  for insert to authenticated
  with check (app.is_super_admin());

create policy members_admin_update on members
  for update to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());

-- A member may update only their own row; the guard trigger from 0003 limits
-- the change to display_name.
create policy members_self_update on members
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- items
-- ---------------------------------------------------------------------------
revoke all on table items from authenticated;
grant select, insert, update on table items to authenticated;

create policy items_select on items
  for select to authenticated
  using (app.is_super_admin() or (active and archived_at is null));

create policy items_admin_insert on items
  for insert to authenticated
  with check (app.is_super_admin());

create policy items_admin_update on items
  for update to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());

-- ---------------------------------------------------------------------------
-- orders / order_items / order_timeline  (SELECT only; writes via RPC)
-- ---------------------------------------------------------------------------
revoke all on table orders from authenticated;
grant select on table orders to authenticated;

create policy orders_select on orders
  for select to authenticated
  using (app.is_super_admin() or member_id = app.current_member_id());

revoke all on table order_items from authenticated;
grant select on table order_items to authenticated;

create policy order_items_select on order_items
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and (app.is_super_admin() or o.member_id = app.current_member_id())
    )
  );

revoke all on table order_timeline from authenticated;
grant select on table order_timeline to authenticated;

create policy order_timeline_select on order_timeline
  for select to authenticated
  using (
    exists (
      select 1 from orders o
      where o.id = order_timeline.order_id
        and (app.is_super_admin() or o.member_id = app.current_member_id())
    )
  );

-- ---------------------------------------------------------------------------
-- inventory  (Super Admin visibility only in V1)
-- ---------------------------------------------------------------------------
revoke all on table inventory from authenticated;
grant select on table inventory to authenticated;

create policy inventory_admin_select on inventory
  for select to authenticated
  using (app.is_super_admin());

revoke all on table inventory_movements from authenticated;
grant select on table inventory_movements to authenticated;

create policy inventory_movements_admin_select on inventory_movements
  for select to authenticated
  using (app.is_super_admin());

-- ---------------------------------------------------------------------------
-- notifications  (own only; recipients may toggle read_at)
-- ---------------------------------------------------------------------------
revoke all on table notifications from authenticated;
grant select, update on table notifications to authenticated;

create policy notifications_select on notifications
  for select to authenticated
  using (recipient_id = app.current_member_id());

create policy notifications_mark_read on notifications
  for update to authenticated
  using (recipient_id = app.current_member_id())
  with check (recipient_id = app.current_member_id());

-- ---------------------------------------------------------------------------
-- activity_logs / audit_logs  (Super Admin read; append-only via RPC)
-- ---------------------------------------------------------------------------
revoke all on table activity_logs from authenticated;
grant select on table activity_logs to authenticated;

create policy activity_logs_admin_select on activity_logs
  for select to authenticated
  using (app.is_super_admin());

revoke all on table audit_logs from authenticated;
grant select on table audit_logs to authenticated;

create policy audit_logs_admin_select on audit_logs
  for select to authenticated
  using (app.is_super_admin());

-- ---------------------------------------------------------------------------
-- organization_settings  (everyone reads; Super Admin updates)
-- ---------------------------------------------------------------------------
revoke all on table organization_settings from authenticated;
grant select, update on table organization_settings to authenticated;

create policy organization_settings_select on organization_settings
  for select to authenticated
  using (true);

create policy organization_settings_admin_update on organization_settings
  for update to authenticated
  using (app.is_super_admin())
  with check (app.is_super_admin());
