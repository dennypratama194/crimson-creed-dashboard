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
  "CAPOREGIME",
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
  "ATTACHMENT",
  "TOOL",
  "OTHER",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_UNITS = [
  "UNIT",
  "ROUND",
  "BOX",
  "GRAM",
  "KILOGRAM",
  "PACK",
] as const;
export type ItemUnit = (typeof ITEM_UNITS)[number];

/**
 * What an item is to the company. Only `CATALOGUE` items are member-facing and
 * orderable; the rest exist purely in the company stash (`/admin/inventory`).
 */
export const STOCK_TYPES = [
  "CATALOGUE",
  "RAW_MATERIAL",
  "TOOL",
  "SEIZED",
  "OTHER",
] as const;
export type StockType = (typeof STOCK_TYPES)[number];

/** Stash-only stock types — everything except the member-facing catalogue. */
export const NON_CATALOGUE_STOCK_TYPES = STOCK_TYPES.filter(
  (t): t is Exclude<StockType, "CATALOGUE"> => t !== "CATALOGUE",
);

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

export const CASH_DIRECTIONS = ["IN", "OUT"] as const;
export type CashDirection = (typeof CASH_DIRECTIONS)[number];

export const CASH_ENTRY_SOURCES = [
  "MANUAL",
  "ADJUSTMENT",
  "ORDER",
  "PAYROLL_RUN",
] as const;
export type CashEntrySource = (typeof CASH_ENTRY_SOURCES)[number];

export const CASH_INCOME_CATEGORIES = [
  "SALES_REVENUE",
  "CAPITAL_INJECTION",
  "OTHER_INCOME",
] as const;
export const CASH_EXPENSE_CATEGORIES = [
  "PAYROLL",
  "INVENTORY_PURCHASE",
  "OPERATING_EXPENSE",
  "WITHDRAWAL",
  "OTHER_EXPENSE",
] as const;
export const CASH_CATEGORIES = [
  ...CASH_INCOME_CATEGORIES,
  ...CASH_EXPENSE_CATEGORIES,
] as const;
export type CashCategory = (typeof CASH_CATEGORIES)[number];

export const MEMBER_SUBMISSION_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "REJECTED",
] as const;
export type MemberSubmissionStatus =
  (typeof MEMBER_SUBMISSION_STATUSES)[number];

export const MOVEMENT_TYPES = [
  "IN",
  "OUT",
  "ADJUSTMENT",
  "PRODUCTION",
  "ORDER",
  "DISTRIBUTION",
  "DEPOSIT",
  "WITHDRAWAL",
  "SUBMISSION",
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
  "CASH_ENTRY",
  "SUPPLIER",
  "SUBMISSION",
  "RELATION",
  "DISTRIBUTION",
  "PRODUCTION_ASSIGNMENT",
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
  "SUBMISSION_SUBMITTED",
  "SUBMISSION_CONFIRMED",
  "SUBMISSION_REJECTED",
  "DISTRIBUTION_ISSUED",
  "DISTRIBUTION_SETTLED",
  "DISTRIBUTION_REVERSED",
  "PRODUCTION_ASSIGNED",
  "PRODUCTION_ASSIGNMENT_PAID",
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
  "ITEM_DELETED",
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
  "CASH_ENTRY_RECORDED",
  "CASH_ENTRY_REVERSED",
  "SUPPLIER_CREATED",
  "SUPPLIER_UPDATED",
  "SUPPLIER_ARCHIVED",
  "SUPPLIER_ITEM_SET",
  "SUPPLIER_ITEM_REMOVED",
  "SUBMISSION_SUBMITTED",
  "SUBMISSION_CONFIRMED",
  "SUBMISSION_REJECTED",
  "SUBMISSION_TARGETS_SET",
  "RELATION_CREATED",
  "RELATION_UPDATED",
  "DISTRIBUTION_RATE_SET",
  "DISTRIBUTION_RATE_REMOVED",
  "DISTRIBUTION_ISSUED",
  "DISTRIBUTION_SETTLED",
  "DISTRIBUTION_REVERSED",
  "PRODUCTION_ASSIGNMENT_CREATED",
  "PRODUCTION_ASSIGNMENT_PAID",
  "PRODUCTION_ASSIGNMENT_CANCELLED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * A consignment draw: the member took stock and owes the company its cut.
 * REVERSED is the mistake path — the stock went back and the debt is void.
 *
 * Named "draw", not "distribution": `DistributionStatus` already means
 * NOT_DISTRIBUTED / DISTRIBUTED on an order, which is a different thing.
 */
export const DRAW_STATUSES = ["OPEN", "SETTLED", "REVERSED"] as const;
export type DrawStatus = (typeof DRAW_STATUSES)[number];

/** PAID is a bookkeeping label only — it posts nothing to company cash. */
export const PRODUCTION_ASSIGNMENT_STATUSES = [
  "UNPAID",
  "PAID",
  "CANCELLED",
] as const;
export type ProductionAssignmentStatus =
  (typeof PRODUCTION_ASSIGNMENT_STATUSES)[number];

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
