-- ============================================================================
-- 0019_production
-- Production & Payroll (piece-rate wages).
--
--   production_rates   : per-product pay rate (one row per PRODUCT item).
--   production_logs     : a member's claim "I processed N units of X".
--                         Rate + name + unit are SNAPSHOT at submission so a
--                         later rate change never rewrites historical pay
--                         (same rule as order_items — PRD §9, §23).
--   payroll_runs        : a pay period. DRAFT -> FINALIZED -> PAID.
--   payroll_run_lines   : per-member rollup snapshot inside a run.
--
-- All writes go through the SECURITY DEFINER RPCs in 0020. No direct
-- INSERT/UPDATE grants for application users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- production_rates
-- ---------------------------------------------------------------------------
create table production_rates (
  item_id     uuid primary key references items (id) on delete restrict,
  unit_rate   numeric(14, 2) not null check (unit_rate >= 0),
  updated_by  uuid references members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table production_rates is 'Existence of a row marks an item as pay-eligible for production logging.';

create trigger production_rates_set_updated_at
  before update on production_rates
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- payroll_runs  (created before production_logs so the FK below resolves)
-- ---------------------------------------------------------------------------
create sequence payroll_run_number_seq start 1001;

create table payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  run_number    text not null unique
                  default 'PR-' || lpad(nextval('payroll_run_number_seq')::text, 6, '0'),
  period_start  date not null,
  period_end    date not null,
  status        payroll_run_status not null default 'DRAFT',
  total_amount  numeric(14, 2) not null default 0 check (total_amount >= 0),
  note          text,
  created_by    uuid references members (id) on delete set null,
  finalized_by  uuid references members (id) on delete set null,
  finalized_at  timestamptz,
  paid_by       uuid references members (id) on delete set null,
  paid_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint payroll_runs_period_order check (period_end >= period_start)
);

create index payroll_runs_status_idx on payroll_runs (status);
create index payroll_runs_period_idx on payroll_runs (period_start desc);

create trigger payroll_runs_set_updated_at
  before update on payroll_runs
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- production_logs
-- ---------------------------------------------------------------------------
create table production_logs (
  id                   uuid primary key default gen_random_uuid(),
  member_id            uuid not null references members (id) on delete restrict,
  item_id              uuid not null references items (id) on delete restrict,
  item_name_snapshot   text not null,
  item_unit_snapshot   item_unit not null,
  quantity             numeric(14, 2) not null check (quantity > 0),
  unit_rate_snapshot   numeric(14, 2) not null check (unit_rate_snapshot >= 0),
  payout_amount        numeric(14, 2) not null check (payout_amount >= 0),
  status               production_log_status not null default 'PENDING',
  note                 text,
  occurred_at          timestamptz not null default now(),
  submitted_at         timestamptz not null default now(),
  reviewed_by          uuid references members (id) on delete set null,
  reviewed_at          timestamptz,
  review_note          text,
  payroll_run_id       uuid references payroll_runs (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column production_logs.payroll_run_id is 'Set when the log is locked into a finalized payroll run; blocks re-review and double payment.';

create index production_logs_member_id_idx on production_logs (member_id);
create index production_logs_status_idx on production_logs (status);
create index production_logs_occurred_at_idx on production_logs (occurred_at desc);
create index production_logs_payroll_run_id_idx on production_logs (payroll_run_id);
create index production_logs_unpaid_approved_idx
  on production_logs (occurred_at)
  where status = 'APPROVED' and payroll_run_id is null;

create trigger production_logs_set_updated_at
  before update on production_logs
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- payroll_run_lines  (immutable rollup; a run is never edited after finalize)
-- ---------------------------------------------------------------------------
create table payroll_run_lines (
  id                    uuid primary key default gen_random_uuid(),
  payroll_run_id        uuid not null references payroll_runs (id) on delete cascade,
  member_id             uuid not null references members (id) on delete restrict,
  member_name_snapshot  text not null,
  log_count             integer not null check (log_count >= 0),
  gross_amount          numeric(14, 2) not null check (gross_amount >= 0),
  created_at            timestamptz not null default now(),
  constraint payroll_run_lines_unique_member unique (payroll_run_id, member_id)
);

create index payroll_run_lines_run_idx on payroll_run_lines (payroll_run_id);
create index payroll_run_lines_member_idx on payroll_run_lines (member_id);

create trigger payroll_run_lines_no_update
  before update on payroll_run_lines
  for each row execute function app.reject_mutation();
