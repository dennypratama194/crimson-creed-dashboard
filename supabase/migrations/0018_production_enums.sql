-- ============================================================================
-- 0018_production_enums
-- New domain enums for the Production & Payroll module (piece-rate wages).
-- Mirror of the additions in src/lib/constants/enums.ts.
--
-- New ENUM VALUES on existing types are added here, on their own, so they are
-- committed before any later migration (0019+) references them — Postgres does
-- not allow a freshly added enum value to be used in the same transaction.
-- ============================================================================

create type production_log_status as enum (
  'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'
);

create type payroll_run_status as enum (
  'DRAFT', 'FINALIZED', 'PAID'
);

alter type notification_type add value if not exists 'PRODUCTION_LOG_SUBMITTED';
alter type notification_type add value if not exists 'PRODUCTION_LOG_APPROVED';
alter type notification_type add value if not exists 'PRODUCTION_LOG_REJECTED';
alter type notification_type add value if not exists 'PAYROLL_FINALIZED';
alter type notification_type add value if not exists 'PAYROLL_PAID';

alter type audit_action add value if not exists 'PRODUCTION_RATE_SET';
alter type audit_action add value if not exists 'PRODUCTION_LOG_SUBMITTED';
alter type audit_action add value if not exists 'PRODUCTION_LOG_REVIEWED';
alter type audit_action add value if not exists 'PRODUCTION_LOG_CANCELLED';
alter type audit_action add value if not exists 'PAYROLL_RUN_CREATED';
alter type audit_action add value if not exists 'PAYROLL_RUN_FINALIZED';
alter type audit_action add value if not exists 'PAYROLL_RUN_PAID';

alter type reference_type add value if not exists 'PRODUCTION_LOG';
alter type reference_type add value if not exists 'PAYROLL_RUN';
