-- ============================================================================
-- 0038_item_unit_box
-- Ammo is bought and sold by the box, not the round. Adds the BOX unit.
-- Kept in its own migration so the value is committed before anything uses it
-- (Postgres forbids using a fresh enum value in the same transaction).
-- Mirror of the addition in src/lib/constants/enums.ts.
-- ============================================================================

alter type item_unit add value if not exists 'BOX';
