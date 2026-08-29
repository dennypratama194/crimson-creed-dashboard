-- ============================================================================
-- 0024_cash_enums
-- New domain enums for the Company Cash module (single treasury ledger).
-- Mirror of the additions in src/lib/constants/enums.ts.
--
-- New ENUM VALUES on existing types are added here, on their own, so they are
-- committed before 0025+ references them — Postgres does not allow a freshly
-- added enum value to be used in the same transaction.
-- ============================================================================

create type cash_direction as enum ('IN', 'OUT');

-- How a ledger entry came to exist. MANUAL = a Super Admin recorded it by hand;
-- ADJUSTMENT = a reversal of an earlier entry; ORDER / PAYROLL_RUN are reserved
-- for the automatic hooks added in a later phase (not wired yet).
create type cash_entry_source as enum (
  'MANUAL', 'ADJUSTMENT', 'ORDER', 'PAYROLL_RUN'
);

-- Reporting buckets. Each category belongs to exactly one direction — enforced
-- in app.cash_category_direction() and re-checked in record_cash_entry().
create type cash_category as enum (
  -- income
  'SALES_REVENUE', 'CAPITAL_INJECTION', 'OTHER_INCOME',
  -- expense
  'PAYROLL', 'INVENTORY_PURCHASE', 'OPERATING_EXPENSE', 'WITHDRAWAL', 'OTHER_EXPENSE'
);

alter type reference_type add value if not exists 'CASH_ENTRY';

alter type audit_action add value if not exists 'CASH_ENTRY_RECORDED';
alter type audit_action add value if not exists 'CASH_ENTRY_REVERSED';
