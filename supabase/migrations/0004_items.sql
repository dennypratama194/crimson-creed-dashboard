-- ============================================================================
-- 0004_items
-- Item catalogue (Super Admin managed). Soft-delete via archived_at so
-- historical order_items stay valid (PRD §13).
-- ============================================================================

create table items (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  category             item_category not null,
  description          text,
  sku                  text,
  unit                 item_unit not null default 'UNIT',
  price                numeric(14, 2) not null default 0 check (price >= 0),
  active               boolean not null default true,
  orderable            boolean not null default true,
  low_stock_threshold  integer not null default 0 check (low_stock_threshold >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,
  constraint items_name_not_blank check (length(trim(name)) >= 1)
);

comment on column items.archived_at is 'Soft delete. Archived items are hidden from the catalogue but remain referenceable by historical orders.';

create unique index items_sku_lower_key
  on items (lower(sku))
  where sku is not null and archived_at is null;
create index items_category_idx on items (category);
create index items_active_idx on items (active) where archived_at is null;

create trigger items_set_updated_at
  before update on items
  for each row execute function app.set_updated_at();

-- Every item has exactly one inventory row (created in 0007 once inventory
-- exists; the trigger is defined there).
