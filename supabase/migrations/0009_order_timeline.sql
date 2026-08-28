-- ============================================================================
-- 0009_order_timeline
-- Per-order transition history (PRD §12). Append-only.
-- ============================================================================

create table order_timeline (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders (id) on delete cascade,
  entry_type   text not null,
  description  text not null,
  actor_id     uuid references members (id) on delete set null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index order_timeline_order_id_idx on order_timeline (order_id, created_at);

create trigger order_timeline_no_change
  before update or delete on order_timeline
  for each row execute function app.reject_mutation();
