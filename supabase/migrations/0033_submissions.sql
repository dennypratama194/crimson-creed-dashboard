-- ============================================================================
-- 0033_submissions
-- Monthly Material Submissions (Phase 17).
--
--   submission_material_types : the handful of materials members hand in
--                               (metal scrap / empty bottle / empty can). Each
--                               maps to an inventory item so a CONFIRMED
--                               submission can post stock. Seeded below.
--   submission_periods         : one row per calendar month. Auto-created on
--                               first activity; no explicit open/finalize step.
--   submission_period_targets  : per-month expected amount per material type
--                               (informational — never blocks a submission).
--   member_submissions         : one (period, member) row. PENDING -> CONFIRMED
--                               / REJECTED. Line quantities are SNAPSHOT with
--                               the material name + unit at CONFIRM time so a
--                               later catalogue change never rewrites history
--                               (same rule as order_items / production_logs).
--   member_submission_lines    : per-material quantity inside a submission.
--
-- All writes go through the SECURITY DEFINER RPCs in 0034. No direct
-- INSERT/UPDATE grants for application users.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- submission_material_types
-- ---------------------------------------------------------------------------
create table submission_material_types (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  unit               item_unit not null default 'UNIT',
  inventory_item_id  uuid not null references items (id) on delete restrict,
  active             boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint submission_material_types_code_not_blank check (length(trim(code)) between 1 and 8),
  constraint submission_material_types_name_not_blank check (length(trim(name)) >= 1)
);

comment on table submission_material_types is 'Small admin-managed catalogue. Existence of a row makes a material collectable in the monthly submission.';

create unique index submission_material_types_one_per_item
  on submission_material_types (inventory_item_id);
create index submission_material_types_active_idx
  on submission_material_types (active, sort_order);

create trigger submission_material_types_set_updated_at
  before update on submission_material_types
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- submission_periods
-- ---------------------------------------------------------------------------
create table submission_periods (
  id            uuid primary key default gen_random_uuid(),
  period_month  date not null unique,
  note          text,
  created_by    uuid references members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint submission_periods_first_of_month check (date_trunc('month', period_month) = period_month)
);

comment on column submission_periods.period_month is 'Always the first day of the month. Created lazily; no open/close lifecycle.';

create index submission_periods_month_idx on submission_periods (period_month desc);

create trigger submission_periods_set_updated_at
  before update on submission_periods
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- submission_period_targets
-- ---------------------------------------------------------------------------
create table submission_period_targets (
  period_id         uuid not null references submission_periods (id) on delete cascade,
  material_type_id  uuid not null references submission_material_types (id) on delete restrict,
  target_quantity   integer not null default 0 check (target_quantity >= 0),
  updated_by        uuid references members (id) on delete set null,
  updated_at        timestamptz not null default now(),
  primary key (period_id, material_type_id)
);

comment on table submission_period_targets is 'Informational monthly quota per material. Under-target submissions are always allowed.';

create trigger submission_period_targets_set_updated_at
  before update on submission_period_targets
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_submissions
-- ---------------------------------------------------------------------------
create table member_submissions (
  id            uuid primary key default gen_random_uuid(),
  period_id     uuid not null references submission_periods (id) on delete restrict,
  member_id     uuid not null references members (id) on delete restrict,
  status        member_submission_status not null default 'PENDING',
  note          text,
  submitted_at  timestamptz not null default now(),
  confirmed_by  uuid references members (id) on delete set null,
  confirmed_at  timestamptz,
  review_note   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint member_submissions_unique_member unique (period_id, member_id)
);

create index member_submissions_period_idx on member_submissions (period_id);
create index member_submissions_member_idx on member_submissions (member_id);
create index member_submissions_status_idx on member_submissions (status);

create trigger member_submissions_set_updated_at
  before update on member_submissions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- member_submission_lines
-- ---------------------------------------------------------------------------
create table member_submission_lines (
  id                    uuid primary key default gen_random_uuid(),
  member_submission_id   uuid not null references member_submissions (id) on delete cascade,
  material_type_id       uuid not null references submission_material_types (id) on delete restrict,
  name_snapshot          text not null,
  unit_snapshot          item_unit not null,
  quantity               integer not null default 0 check (quantity >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint member_submission_lines_unique_type unique (member_submission_id, material_type_id)
);

comment on column member_submission_lines.quantity is 'While the submission is CONFIRMED this is also the amount posted to inventory; a re-confirm posts the signed delta.';

create index member_submission_lines_submission_idx on member_submission_lines (member_submission_id);
create index member_submission_lines_type_idx on member_submission_lines (material_type_id);

create trigger member_submission_lines_set_updated_at
  before update on member_submission_lines
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- seed the three materials from the reference spreadsheet + their stock items
-- (structural, like the cash_account singleton — the app needs these to exist)
-- ---------------------------------------------------------------------------
with new_items as (
  insert into items (name, category, unit, price, orderable, active)
  values
    ('Metal Scrap',  'OTHER', 'KILOGRAM', 0, false, true),
    ('Empty Bottle', 'OTHER', 'UNIT',     0, false, true),
    ('Empty Can',    'OTHER', 'UNIT',     0, false, true)
  returning id, name
)
insert into submission_material_types (code, name, unit, sort_order, inventory_item_id)
select v.code, v.name, v.unit, v.sort_order, ni.id
from (values
  ('MS', 'Metal Scrap',  'KILOGRAM'::item_unit, 1),
  ('EB', 'Empty Bottle', 'UNIT'::item_unit,     2),
  ('EC', 'Empty Can',    'UNIT'::item_unit,     3)
) as v(code, name, unit, sort_order)
join new_items ni on ni.name = v.name;
