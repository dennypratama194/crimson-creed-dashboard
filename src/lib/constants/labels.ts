import type {
  AppRole,
  DistributionStatus,
  ItemCategory,
  ItemUnit,
  MemberRank,
  MemberStatus,
  MovementType,
  OrderStatus,
  PayrollRunStatus,
  PaymentStatus,
  ProductionLogStatus,
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
  B: "B",
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
  OTHER: "Other",
};

export const ITEM_UNIT_LABEL: Record<ItemUnit, string> = {
  UNIT: "Unit",
  ROUND: "Round",
  GRAM: "Gram",
  KILOGRAM: "Kilogram",
  PACK: "Pack",
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

export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  IN: "Stock in",
  OUT: "Stock out",
  ADJUSTMENT: "Adjustment",
  PRODUCTION: "Production",
  ORDER: "Order",
  DISTRIBUTION: "Distribution",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
};
