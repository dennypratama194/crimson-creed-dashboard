import type {
  AppRole,
  CashCategory,
  CashDirection,
  CashEntrySource,
  DistributionStatus,
  ItemCategory,
  ItemUnit,
  MemberRank,
  MemberStatus,
  MemberSubmissionStatus,
  MovementType,
  OrderStatus,
  PayrollRunStatus,
  PaymentStatus,
  ProductionLogStatus,
  StockType,
} from "@/lib/constants/enums";

/** Human-readable labels. UI must render these, never the raw enum token. */

export const APP_ROLE_LABEL: Record<AppRole, string> = {
  SUPER_ADMIN: "Super Admin",
  MEMBER: "Member",
};

export const MEMBER_RANK_LABEL: Record<MemberRank, string> = {
  BOSS: "Boss",
  UNDER_BOSS: "Under Boss",
  SECRETARY: "Secretary",
  CAPOREGIME: "Caporegime",
  SOLDIER: "Soldier",
};

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  WEAPON: "Weapon",
  AMMO: "Ammo",
  VEST: "Vest",
  PRODUCT: "Product",
  ATTACHMENT: "Attachment",
  TOOL: "Tool",
  OTHER: "Other",
};

export const ITEM_UNIT_LABEL: Record<ItemUnit, string> = {
  UNIT: "Unit",
  ROUND: "Round",
  BOX: "Box",
  GRAM: "Gram",
  KILOGRAM: "Kilogram",
  PACK: "Pack",
};

export const STOCK_TYPE_LABEL: Record<StockType, string> = {
  CATALOGUE: "Catalogue",
  RAW_MATERIAL: "Raw material",
  TOOL: "Tool",
  SEIZED: "Seized",
  OTHER: "Other",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PAYMENT_SUBMITTED: "Payment submitted",
  PAID: "Paid",
  PAYMENT_REJECTED: "Payment rejected",
};

export const DISTRIBUTION_STATUS_LABEL: Record<DistributionStatus, string> = {
  NOT_DISTRIBUTED: "Not distributed",
  DISTRIBUTED: "Distributed",
};

export const PRODUCTION_LOG_STATUS_LABEL: Record<ProductionLogStatus, string> =
  {
    PENDING: "Pending review",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled",
  };

export const PAYROLL_RUN_STATUS_LABEL: Record<PayrollRunStatus, string> = {
  DRAFT: "Draft",
  FINALIZED: "Finalized",
  PAID: "Paid",
};

export const CASH_DIRECTION_LABEL: Record<CashDirection, string> = {
  IN: "Income",
  OUT: "Expense",
};

export const CASH_CATEGORY_LABEL: Record<CashCategory, string> = {
  SALES_REVENUE: "Sales revenue",
  CAPITAL_INJECTION: "Capital injection",
  OTHER_INCOME: "Other income",
  PAYROLL: "Payroll",
  INVENTORY_PURCHASE: "Inventory purchase",
  OPERATING_EXPENSE: "Operating expense",
  WITHDRAWAL: "Withdrawal",
  OTHER_EXPENSE: "Other expense",
};

export const CASH_ENTRY_SOURCE_LABEL: Record<CashEntrySource, string> = {
  MANUAL: "Manual",
  ADJUSTMENT: "Reversal",
  ORDER: "Order",
  PAYROLL_RUN: "Payroll run",
};

export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  IN: "Stock in",
  OUT: "Stock out",
  ADJUSTMENT: "Adjustment",
  PRODUCTION: "Production",
  ORDER: "Order",
  DISTRIBUTION: "Distribution",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  SUBMISSION: "Monthly submission",
};

export const MEMBER_SUBMISSION_STATUS_LABEL: Record<
  MemberSubmissionStatus,
  string
> = {
  PENDING: "Awaiting review",
  CONFIRMED: "Confirmed",
  REJECTED: "Rejected",
};

/** Shown where a member has no submission row for the month yet. */
export const MEMBER_SUBMISSION_MISSING_LABEL = "Not submitted";
