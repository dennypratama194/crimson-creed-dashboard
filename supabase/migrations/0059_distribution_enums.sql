-- ============================================================================
-- 0059_distribution_enums
-- New domain enums for Phase 19 — Distribution (consignment draws) and the
-- rewritten Production assignment board. Mirror of the additions in
-- src/lib/constants/enums.ts.
--
-- New ENUM VALUES on existing types are added here, on their own, so they are
-- committed before 0060+ references them — Postgres does not allow a freshly
-- added enum value to be used in the same transaction.
-- ============================================================================

-- A draw is either outstanding, paid back in full, or undone as a mistake.
create type draw_status as enum ('OPEN', 'SETTLED', 'REVERSED');

-- An assignment is either unpaid, paid, or cancelled. No approval step: the
-- Super Admin creates the record, so there is nothing for them to approve.
create type production_assignment_status as enum ('UNPAID', 'PAID', 'CANCELLED');

alter type notification_type add value if not exists 'DISTRIBUTION_ISSUED';
alter type notification_type add value if not exists 'DISTRIBUTION_SETTLED';
alter type notification_type add value if not exists 'DISTRIBUTION_REVERSED';
alter type notification_type add value if not exists 'PRODUCTION_ASSIGNED';
alter type notification_type add value if not exists 'PRODUCTION_ASSIGNMENT_PAID';

alter type audit_action add value if not exists 'DISTRIBUTION_RATE_SET';
alter type audit_action add value if not exists 'DISTRIBUTION_RATE_REMOVED';
alter type audit_action add value if not exists 'DISTRIBUTION_ISSUED';
alter type audit_action add value if not exists 'DISTRIBUTION_SETTLED';
alter type audit_action add value if not exists 'DISTRIBUTION_REVERSED';
alter type audit_action add value if not exists 'PRODUCTION_ASSIGNMENT_CREATED';
alter type audit_action add value if not exists 'PRODUCTION_ASSIGNMENT_PAID';
alter type audit_action add value if not exists 'PRODUCTION_ASSIGNMENT_CANCELLED';

alter type reference_type add value if not exists 'DISTRIBUTION';
alter type reference_type add value if not exists 'PRODUCTION_ASSIGNMENT';
