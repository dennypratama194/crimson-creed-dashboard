-- ============================================================================
-- 0042_relation_enums
-- New enum values for the Relations module (Manage → Relations, Super Admin
-- only). Kept in its own migration so the values are committed before 0043–0044
-- reference them — Postgres forbids using a freshly added enum value in the
-- same transaction. Mirror of the additions in src/lib/constants/enums.ts.
-- ============================================================================

-- Relation writes are audited like every other Manage-section change.
alter type audit_action add value if not exists 'RELATION_CREATED';
alter type audit_action add value if not exists 'RELATION_UPDATED';

-- Polymorphic reference target for activity_logs / audit_logs rows.
alter type reference_type add value if not exists 'RELATION';
