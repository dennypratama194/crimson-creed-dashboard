-- ============================================================================
-- 0071_item_delete_enum
-- Audit action for the hard delete added in 0072. On its own so the value is
-- committed before 0072 references it — Postgres will not let a freshly added
-- enum value be used in the same transaction.
-- ============================================================================

alter type audit_action add value if not exists 'ITEM_DELETED';
