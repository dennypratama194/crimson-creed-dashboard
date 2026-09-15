import type {
  CashDirection,
  DistributionStatus,
  DrawStatus,
  MemberSubmissionStatus,
  OrderStatus,
  PayrollRunStatus,
  PaymentStatus,
  ProductionAssignmentStatus,
  ProductionLogStatus,
} from "@/lib/constants/enums";

/** Visual tone tokens (see globals.css --tone-* variables). */
export type Tone = "gray" | "brand" | "success" | "warning" | "error" | "info";

/**
 * Solid dot colour for a tone — a quiet status accent on a text row where an
 * icon or full <Badge> would be too loud.
 */
export const TONE_DOT: Record<Tone, string> = {
  gray: "bg-tone-gray-fg",
  brand: "bg-tone-brand-fg",
  success: "bg-tone-success-fg",
  warning: "bg-tone-warning-fg",
  error: "bg-tone-error-fg",
  info: "bg-tone-info-fg",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING: "warning",
  PROCESSING: "info",
  COMPLETED: "success",
  CANCELLED: "gray",
  REJECTED: "error",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  UNPAID: "gray",
  PAYMENT_SUBMITTED: "warning",
  PAID: "success",
  PAYMENT_REJECTED: "error",
};

export const DISTRIBUTION_STATUS_TONE: Record<DistributionStatus, Tone> = {
  NOT_DISTRIBUTED: "gray",
  DISTRIBUTED: "success",
};

/** A consignment draw. OPEN money is still owed, so it reads as a warning. */
export const DRAW_STATUS_TONE: Record<DrawStatus, Tone> = {
  OPEN: "warning",
  SETTLED: "success",
  REVERSED: "gray",
};

export const PRODUCTION_ASSIGNMENT_STATUS_TONE: Record<
  ProductionAssignmentStatus,
  Tone
> = {
  UNPAID: "warning",
  PAID: "success",
  CANCELLED: "gray",
};

export const PRODUCTION_LOG_STATUS_TONE: Record<ProductionLogStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "error",
  CANCELLED: "gray",
};

export const PAYROLL_RUN_STATUS_TONE: Record<PayrollRunStatus, Tone> = {
  DRAFT: "gray",
  FINALIZED: "info",
  PAID: "success",
};

export const MEMBER_SUBMISSION_STATUS_TONE: Record<
  MemberSubmissionStatus,
  Tone
> = {
  PENDING: "warning",
  CONFIRMED: "success",
  REJECTED: "error",
};

export const CASH_DIRECTION_TONE: Record<CashDirection, Tone> = {
  IN: "success",
  OUT: "error",
};

/**
 * Allowed order-status transitions (PRD §25 — no arbitrary transitions such as
 * COMPLETED -> PENDING). The server RPC layer is the enforcement point; the UI
 * uses this only to decide which actions to render.
 */
export const ORDER_STATUS_TRANSITIONS: Record<
  OrderStatus,
  readonly OrderStatus[]
> = {
  PENDING: ["PROCESSING", "CANCELLED", "REJECTED"],
  PROCESSING: ["COMPLETED", "CANCELLED", "REJECTED"],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
};

export const PAYMENT_STATUS_TRANSITIONS: Record<
  PaymentStatus,
  readonly PaymentStatus[]
> = {
  UNPAID: ["PAYMENT_SUBMITTED"],
  PAYMENT_SUBMITTED: ["PAID", "PAYMENT_REJECTED"],
  PAYMENT_REJECTED: ["PAYMENT_SUBMITTED"],
  PAID: [],
};

export const DISTRIBUTION_STATUS_TRANSITIONS: Record<
  DistributionStatus,
  readonly DistributionStatus[]
> = {
  NOT_DISTRIBUTED: ["DISTRIBUTED"],
  DISTRIBUTED: [],
};

export function canTransitionOrderStatus(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

/** Members may cancel only their own PENDING orders (PRD §9, §24). */
export function memberCanCancel(status: OrderStatus): boolean {
  return status === "PENDING";
}
