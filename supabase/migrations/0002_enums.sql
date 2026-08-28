-- ============================================================================
-- 0002_enums
-- Domain enum types. Mirror of src/lib/constants/enums.ts.
-- (PRD gap: the exact status lists in PRD §9 rendered as empty headings in the
--  supplied PDF; these are the agreed working sets — see IMPLEMENTATION_PLAN.md.)
-- ============================================================================

create type app_role as enum ('SUPER_ADMIN', 'MEMBER');

create type member_rank as enum ('BOSS', 'UNDER_BOSS', 'SECRETARY', 'B', 'SOLDIER');

create type member_status as enum ('ACTIVE', 'INACTIVE');

create type item_category as enum ('WEAPON', 'AMMO', 'VEST', 'PRODUCT', 'OTHER');

create type item_unit as enum ('UNIT', 'ROUND', 'GRAM', 'KILOGRAM', 'PACK');

create type order_status as enum (
  'PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'REJECTED'
);

create type payment_status as enum (
  'UNPAID', 'PAYMENT_SUBMITTED', 'PAID', 'PAYMENT_REJECTED'
);

create type distribution_status as enum ('NOT_DISTRIBUTED', 'DISTRIBUTED');

create type movement_type as enum (
  'IN', 'OUT', 'ADJUSTMENT', 'PRODUCTION', 'ORDER', 'DISTRIBUTION',
  'DEPOSIT', 'WITHDRAWAL'
);

create type reference_type as enum (
  'ORDER', 'ORDER_ITEM', 'ITEM', 'MEMBER', 'INVENTORY_ADJUSTMENT', 'MANUAL'
);

create type notification_type as enum (
  'ORDER_CREATED',
  'ORDER_PROCESSING',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'ORDER_REJECTED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REJECTED',
  'DISTRIBUTION_READY',
  'DISTRIBUTION_COMPLETED',
  'LOW_STOCK'
);

create type audit_action as enum (
  'MEMBER_CREATED',
  'MEMBER_UPDATED',
  'MEMBER_DEACTIVATED',
  'MEMBER_REACTIVATED',
  'MEMBER_PASSWORD_RESET',
  'ITEM_CREATED',
  'ITEM_UPDATED',
  'ITEM_ARCHIVED',
  'ORDER_CREATED',
  'ORDER_STATUS_CHANGED',
  'ORDER_CANCELLED',
  'ORDER_REJECTED',
  'PAYMENT_SUBMITTED',
  'PAYMENT_VERIFIED',
  'PAYMENT_REJECTED',
  'DISTRIBUTION_RECORDED',
  'INVENTORY_ADJUSTED',
  'SETTINGS_UPDATED'
);
