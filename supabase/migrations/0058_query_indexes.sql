-- ============================================================================
-- 0058_query_indexes
-- Composite indexes for the "rows for one owner, newest first" reads that the
-- single-column indexes from 0005 / 0007 / 0008 only half cover:
--
--   orders (member_id, created_at desc)
--     member order list, member_dashboard() active / recent orders
--   notifications (recipient_id, created_at desc)
--     notification centre, member_dashboard() recent notifications
--   inventory_movements (item_id, created_at desc)
--     stash item detail movement history
--
-- Every other index the dashboard / list pages lean on already exists (orders
-- status / payment_status / distribution_status / created_at, order_items
-- order_id, notifications unread partial, cash_entries occurred_at,
-- production_logs status / member_id / payroll_run_id, member_submissions
-- unique (period_id, member_id)), so nothing is duplicated here.
--
-- Additive only. `if not exists` makes a re-run a no-op. Plain CREATE INDEX
-- (not CONCURRENTLY — migrations run inside a transaction) briefly blocks
-- writes to each table while it builds; all three tables are small.
-- ============================================================================

create index if not exists orders_member_created_at_idx
  on orders (member_id, created_at desc);

create index if not exists notifications_recipient_created_at_idx
  on notifications (recipient_id, created_at desc);

create index if not exists inventory_movements_item_created_at_idx
  on inventory_movements (item_id, created_at desc);
