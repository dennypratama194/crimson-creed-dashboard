-- ============================================================================
-- 0060_distribution
-- Phase 19. Replaces the piece-rate production module with two report-only
-- boards. Neither touches company cash — a status here is a record of what
-- happened, not a treasury posting.
--
--   distribution_rates      : per-item company cut (e.g. 450 per pc). One row
--                             per item; the org sets a rate for each drawable
--                             stash item, not just one.
--   distributions           : a member drew N units of a stash item and owes
--                             quantity x rate back to the company.
--                             OPEN -> SETTLED, or REVERSED if mis-entered.
--   production_assignments  : "this member is in charge of producing N of X",
--                             flagged UNPAID / PAID by the Super Admin.
--
-- Rate, item name and unit are SNAPSHOT at issue so changing a rate later never
-- rewrites an existing debt (same rule as order_items — PRD s9, s23).
--
-- All writes go through the SECURITY DEFINER RPCs in 0061. No direct
-- INSERT/UPDATE grants for application users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- distribution_rates
-- ---------------------------------------------------------------------------
create table distribution_rates (
  item_id     uuid primary key references items (id) on delete restrict,
  unit_rate   numeric(14, 2) not null check (unit_rate >= 0),
  updated_by  uuid references members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table distribution_rates is
  'Existence of a row marks a stash item as drawable. unit_rate is what the member owes the company per unit, not what they sell it for.';

create trigger distribution_rates_set_updated_at
  before update on distribution_rates
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- distributions
-- ---------------------------------------------------------------------------
create sequence distribution_number_seq start 1001;

create table distributions (
  id                  uuid primary key default gen_random_uuid(),
  draw_number         text not null unique
                        default 'DR-' || lpad(nextval('distribution_number_seq')::text, 6, '0'),
  member_id           uuid not null references members (id) on delete restrict,
  item_id             uuid not null references items (id) on delete restrict,
  item_name_snapshot  text not null,
  item_unit_snapshot  item_unit not null,
  quantity            integer not null check (quantity > 0),
  unit_rate_snapshot  numeric(14, 2) not null check (unit_rate_snapshot >= 0),
  amount_owed         numeric(14, 2) not null check (amount_owed >= 0),
  status              draw_status not null default 'OPEN',
  note                text,
  resolution_note     text,
  issued_by           uuid references members (id) on delete set null,
  issued_at           timestamptz not null default now(),
  settled_by          uuid references members (id) on delete set null,
  settled_at          timestamptz,
  reversed_by         uuid references members (id) on delete set null,
  reversed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint distributions_note_max_len check (char_length(note) <= 500),
  constraint distributions_resolution_note_max_len check (char_length(resolution_note) <= 500)
);

comment on column distributions.quantity is
  'Whole units. inventory.current_quantity and inventory_movements.quantity are both integer, and a draw posts a movement.';
comment on column distributions.amount_owed is
  'quantity x unit_rate_snapshot, computed server-side. Never trusted from the browser.';
comment on column distributions.status is
  'OPEN = still owed, SETTLED = handed back in full, REVERSED = mis-entered and the stock was returned.';

create index distributions_member_id_idx on distributions (member_id);
create index distributions_status_idx on distributions (status);
create index distributions_issued_at_idx on distributions (issued_at desc);
create index distributions_open_idx
  on distributions (member_id)
  where status = 'OPEN';

create trigger distributions_set_updated_at
  before update on distributions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- production_assignments
-- ---------------------------------------------------------------------------
create table production_assignments (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null references members (id) on delete restrict,
  item_id             uuid not null references items (id) on delete restrict,
  item_name_snapshot  text not null,
  item_unit_snapshot  item_unit not null,
  quantity            numeric(14, 2) not null check (quantity > 0),
  status              production_assignment_status not null default 'UNPAID',
  note                text,
  assigned_by         uuid references members (id) on delete set null,
  assigned_at         timestamptz not null default now(),
  paid_by             uuid references members (id) on delete set null,
  paid_at             timestamptz,
  cancelled_by        uuid references members (id) on delete set null,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint production_assignments_note_max_len check (char_length(note) <= 500)
);

comment on table production_assignments is
  'Admin-created. A member never files one; they only read the assignments addressed to them.';
comment on column production_assignments.status is
  'PAID is a bookkeeping label only — it posts nothing to company cash.';

create index production_assignments_member_id_idx on production_assignments (member_id);
create index production_assignments_status_idx on production_assignments (status);
create index production_assignments_assigned_at_idx on production_assignments (assigned_at desc);

create trigger production_assignments_set_updated_at
  before update on production_assignments
  for each row execute function app.set_updated_at();
