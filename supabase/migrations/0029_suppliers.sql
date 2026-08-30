-- ============================================================================
-- 0029_suppliers
-- Suppliers module (Phase 16, Super Admin only). A supplier carries many items;
-- an item is carried by many suppliers. supplier_items is the price book: each
-- (supplier, item) pair has its own buy price, sell price and max quantity as
-- quoted by that supplier.
--
-- The member-facing price stays on items.price. supplier_items.sell_price is
-- informational — it never feeds order totals. Members never see either table
-- (RLS in 0031).
-- ============================================================================

create table suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  code         text not null,
  contact      text,
  notes        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  constraint suppliers_name_not_blank check (length(trim(name)) >= 1),
  constraint suppliers_code_not_blank check (length(trim(code)) >= 1)
);

comment on column suppliers.archived_at is 'Soft delete. Archived suppliers are hidden from the catalogue but their supplier_items rows are kept.';

create unique index suppliers_code_lower_key
  on suppliers (lower(code)) where archived_at is null;
create unique index suppliers_name_lower_key
  on suppliers (lower(name)) where archived_at is null;
create index suppliers_active_idx on suppliers (active) where archived_at is null;

create trigger suppliers_set_updated_at
  before update on suppliers
  for each row execute function app.set_updated_at();

-- ── supplier_items (join / price book) ─────────────────────────────────────
-- Pure configuration: never referenced by historical orders, so no soft delete.
-- Disable a line with active = false; drop it with remove_supplier_item().
create table supplier_items (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references suppliers (id) on delete restrict,
  item_id       uuid not null references items (id) on delete restrict,
  buy_price     numeric(14, 2) not null default 0 check (buy_price >= 0),
  sell_price    numeric(14, 2) check (sell_price is null or sell_price >= 0),
  max_quantity  integer check (max_quantity is null or max_quantity >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint supplier_items_unique_pair unique (supplier_id, item_id)
);

create index supplier_items_supplier_idx on supplier_items (supplier_id);
create index supplier_items_item_idx on supplier_items (item_id);

create trigger supplier_items_set_updated_at
  before update on supplier_items
  for each row execute function app.set_updated_at();
