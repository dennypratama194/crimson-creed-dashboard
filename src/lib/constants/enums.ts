/**
 * Single source of truth for domain enums. These mirror the PostgreSQL enum
 * types defined in supabase/migrations. Never hard-code these strings in UI or
 * services — import from here (PRD §13, §23).
 *
 * NOTE (PRD gap): the exact status value lists rendered as empty headings in the
 * supplied PRD PDF (§9). The sets below are the agreed working assumptions and
 * are intentionally centralised so a revision touches one file + one migration.
 */

export const APP_ROLES = ["SUPER_ADMIN", "MEMBER"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const MEMBER_RANKS = [
  "BOSS",
  "UNDER_BOSS",
  "SECRETARY",
  "B",
  "SOLDIER",
] as const;
export type MemberRank = (typeof MEMBER_RANKS)[number];

export const MEMBER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const ITEM_CATEGORIES = [
  "WEAPON",
  "AMMO",
  "VEST",
  "PRODUCT",
  "OTHER",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_UNITS = [
  "UNIT",
  "ROUND",
  "GRAM",
  "KILOGRAM",
  "PACK",
] as const;
export type ItemUnit = (typeof ITEM_UNITS)[number];

export const ORDER_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "UNPAID",
  "PAYMENT_SUBMITTED",
  "PAID",
  "PAYMENT_REJECTED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const DISTRIBUTION_STATUSES = [
  "NOT_DISTRIBUTED",
  "DISTRIBUTED",
] as const;
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];

export const PRODUCTION_LOG_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type ProductionLogStatus = (typeof PRODUCTION_LOG_STATUSES)[number];

export const PAYROLL_RUN_STATUSES = ["DRAFT", "FINALIZED", "PAID"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const MOVEMENT_TYPES = [
  "IN",
  "OUT",
  "ADJUSTMENT",
  "PRODUCTION",
  "ORDER",
  "DISTRIBUTION",
  "DEPOSIT",
  "WITHDRAWAL",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Polymorphic reference targets used by movements, notifications, timeline, audit. */
export const REFERENCE_TYPES = [
  "ORDER",
  "ORDER_ITEM",
  "ITEM",
  "MEMBER",
  "INVENTORY_ADJUSTMENT",
  "MANUAL",
  "PRODUCTION_LOG",
  "PAYROLL_RUN",
] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export const NOTIFICATION_TYPES = [
  "ORDER_CREATED",
  "ORDER_PROCESSING",
  "ORDER_COMPLETED",
  "ORDER_CANCELLED",
  "ORDER_REJECTED",
  "PAYMENT_SUBMITTED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REJECTED",
  "DISTRIBUTION_READY",
  "DISTRIBUTION_COMPLETED",
  "LOW_STOCK",
  "PRODUCTION_LOG_SUBMITTED",
  "PRODUCTION_LOG_APPROVED",
  "PRODUCTION_LOG_REJECTED",
  "PAYROLL_FINALIZED",
  "PAYROLL_PAID",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const AUDIT_ACTIONS = [
  "MEMBER_CREATED",
  "MEMBER_UPDATED",
  "MEMBER_DEACTIVATED",
  "MEMBER_REACTIVATED",
  "MEMBER_DELETED",
  "MEMBER_PASSWORD_RESET",
  "ITEM_CREATED",
  "ITEM_UPDATED",
  "ITEM_ARCHIVED",
  "ORDER_CREATED",
  "ORDER_STATUS_CHANGED",
  "ORDER_CANCELLED",
  "ORDER_REJECTED",
  "PAYMENT_SUBMITTED",
  "PAYMENT_VERIFIED",
  "PAYMENT_REJECTED",
  "DISTRIBUTION_RECORDED",
  "INVENTORY_ADJUSTED",
  "SETTINGS_UPDATED",
  "PRODUCTION_RATE_SET",
  "PRODUCTION_LOG_SUBMITTED",
  "PRODUCTION_LOG_REVIEWED",
  "PRODUCTION_LOG_CANCELLED",
  "PAYROLL_RUN_CREATED",
  "PAYROLL_RUN_FINALIZED",
  "PAYROLL_RUN_PAID",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
