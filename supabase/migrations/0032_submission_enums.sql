-- ============================================================================
-- 0032_submission_enums
-- New domain enums for the Monthly Material Submissions module (Phase 17).
-- Mirror of the additions in src/lib/constants/enums.ts.
--
-- New ENUM VALUES on existing types are added here, on their own, so they are
-- committed before 0033+ references them — Postgres does not allow a freshly
-- added enum value to be used in the same transaction.
-- ============================================================================

-- A member's monthly hand-in: PENDING (claimed, awaiting review) -> CONFIRMED
-- (admin verified, counted, stock posted) or REJECTED (bounced back to resubmit).
create type member_submission_status as enum ('PENDING', 'CONFIRMED', 'REJECTED');

-- Stock in from a confirmed monthly submission.
alter type movement_type add value if not exists 'SUBMISSION';

-- Polymorphic pointer at a member_submissions row.
alter type reference_type add value if not exists 'SUBMISSION';

alter type notification_type add value if not exists 'SUBMISSION_SUBMITTED';
alter type notification_type add value if not exists 'SUBMISSION_CONFIRMED';
alter type notification_type add value if not exists 'SUBMISSION_REJECTED';

alter type audit_action add value if not exists 'SUBMISSION_SUBMITTED';
alter type audit_action add value if not exists 'SUBMISSION_CONFIRMED';
alter type audit_action add value if not exists 'SUBMISSION_REJECTED';
alter type audit_action add value if not exists 'SUBMISSION_TARGETS_SET';
