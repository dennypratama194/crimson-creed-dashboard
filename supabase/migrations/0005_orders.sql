-- ============================================================================
-- 0005_orders
-- Order header. Three independent status dimensions (PRD §11). Totals are
-- always computed server-side by the RPC layer (PRD §10, §23); no direct
-- INSERT/UPDATE policy exists for application users.
-- ============================================================================

create sequence order_number_seq start 1001;

create table orders (
  id                   uuid primary key default gen_random_uuid(),
  order_number         text not null unique
                         default 'CC-' || lpad(nextval('order_number_seq')::text, 6, '0'),
  member_id            uuid not null references members (id) on delete restrict,
  status               order_status not null default 'PENDING',
  payment_status       payment_status not null default 'UNPAID',
  distribution_status  distribution_status not null default 'NOT_DISTRIBUTED',
  subtotal             numeric(14, 2) not null default 0 check (subtotal >= 0),
  total                numeric(14, 2) not null default 0 check (total >= 0),
  note                 text,
  payment_note         text,
  distribution_note    text,
  cancel_reason        text,
  submitted_at         timestamptz not null default now(),
  processing_at        timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table orders is 'V1 has no tax/discount so total = subtotal; both kept for future.';

create index orders_member_id_idx on orders (member_id);
create index orders_status_idx on orders (status);
create index orders_payment_status_idx on orders (payment_status);
create index orders_distribution_status_idx on orders (distribution_status);
create index orders_created_at_idx on orders (created_at desc);

create trigger orders_set_updated_at
  before update on orders
  for each row execute function app.set_updated_at();
