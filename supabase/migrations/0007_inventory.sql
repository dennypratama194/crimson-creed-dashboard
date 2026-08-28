-- ============================================================================
-- 0007_inventory
-- Current stock (mutable, but only via RPC) + immutable movement ledger.
-- Never let a client overwrite current_quantity directly (PRD §14).
-- ============================================================================

create table inventory (
  item_id           uuid primary key references items (id) on delete restrict,
  current_quantity  integer not null default 0,
  updated_at        timestamptz not null default now()
);

create table inventory_movements (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references items (id) on delete restrict,
  quantity        integer not null check (quantity <> 0),
  movement_type   movement_type not null,
  reference_type  reference_type not null default 'MANUAL',
  reference_id    uuid,
  performed_by    uuid references members (id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now()
);

comment on column inventory_movements.quantity is 'Signed delta: positive = stock in, negative = stock out.';

create index inventory_movements_item_id_idx on inventory_movements (item_id);
create index inventory_movements_created_at_idx on inventory_movements (created_at desc);
create index inventory_movements_reference_idx on inventory_movements (reference_type, reference_id);

create trigger inventory_movements_no_change
  before update or delete on inventory_movements
  for each row execute function app.reject_mutation();

-- Auto-provision an inventory row for every new item.
create or replace function app.create_inventory_for_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into inventory (item_id) values (new.id)
  on conflict (item_id) do nothing;
  return new;
end;
$$;

create trigger items_create_inventory
  after insert on items
  for each row execute function app.create_inventory_for_item();
