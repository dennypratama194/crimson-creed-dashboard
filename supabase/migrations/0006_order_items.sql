-- ============================================================================
-- 0006_order_items
-- Line items with price + name + unit SNAPSHOTS taken at submission time
-- (PRD §9, §23). Immutable after creation.
-- ============================================================================

create table order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references orders (id) on delete cascade,
  item_id              uuid not null references items (id) on delete restrict,
  item_name_snapshot   text not null,
  item_unit_snapshot   item_unit not null,
  unit_price_snapshot  numeric(14, 2) not null check (unit_price_snapshot >= 0),
  quantity             integer not null check (quantity > 0),
  line_total           numeric(14, 2) not null check (line_total >= 0),
  created_at           timestamptz not null default now(),
  constraint order_items_unique_item_per_order unique (order_id, item_id)
);

create index order_items_order_id_idx on order_items (order_id);
create index order_items_item_id_idx on order_items (item_id);

-- Immutable: no UPDATE/DELETE by application users (RLS grants none), and this
-- trigger blocks it even for roles that might otherwise slip through.
create trigger order_items_no_update
  before update on order_items
  for each row execute function app.reject_mutation();
