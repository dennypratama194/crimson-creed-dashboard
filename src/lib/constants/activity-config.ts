import type { Tone } from "@/lib/constants/status-config";

/**
 * Maps an `activity_logs.verb` (emitted by the RPC layer — see migration 0013)
 * to a status tone, so the activity feed carries a quiet colour accent without
 * an icon on every row. Unknown verbs fall back to "gray".
 */
export const ACTIVITY_TONE: Record<string, Tone> = {
  "order.created": "info",
  "order.processing": "info",
  "order.distributed": "success",
  "order.completed": "success",
  "order.cancelled": "gray",
  "order.rejected": "error",
  "payment.submitted": "warning",
  "payment.verified": "success",
  "payment.rejected": "error",
  "inventory.moved": "gray",
  "production.rate_set": "gray",
  "production.logged": "info",
  "production.approved": "success",
  "production.rejected": "error",
  "production.cancelled": "gray",
  "payroll.created": "gray",
  "payroll.finalized": "info",
  "payroll.paid": "success",
};
