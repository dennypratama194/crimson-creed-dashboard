-- ============================================================================
-- 0028_supplier_enums
-- New enum values for the Suppliers module (Phase 16). Kept in its own migration
-- so the values are committed before 0029–0031 (and the seed) reference them —
-- Postgres forbids using a freshly added enum value in the same transaction.
-- Mirror of the additions in src/lib/constants/enums.ts.
-- ============================================================================

-- Catalogue gains weapon attachments (FFORBLUD) and tools / hacking gear (NN).
alter type item_category add value if not exists 'ATTACHMENT';
alter type item_category add value if not exists 'TOOL';

-- Supplier + supplier-item writes are audited like every other catalogue change.
alter type audit_action add value if not exists 'SUPPLIER_CREATED';
alter type audit_action add value if not exists 'SUPPLIER_UPDATED';
alter type audit_action add value if not exists 'SUPPLIER_ARCHIVED';
alter type audit_action add value if not exists 'SUPPLIER_ITEM_SET';
alter type audit_action add value if not exists 'SUPPLIER_ITEM_REMOVED';

-- Polymorphic reference target for activity_logs / audit_logs rows.
alter type reference_type add value if not exists 'SUPPLIER';
