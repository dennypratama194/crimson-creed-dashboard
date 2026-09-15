/**
 * RPC response contracts — hand-authored, and deliberately NOT in
 * `src/lib/database.types.ts`.
 *
 * `npm run db:types` overwrites the schema-types file wholesale. Everything
 * that lived there and was not generated — the jsonb payload shapes below —
 * was one regeneration away from being deleted. They live here instead, and
 * this file is never written by a generator.
 *
 * WHAT A TYPE HERE DOES AND DOES NOT PROVE
 * ----------------------------------------
 * Postgres hands a `returns jsonb` function's result back as opaque JSON. A
 * TypeScript type over it is a claim about what the migration builds, checked
 * by nobody at runtime. So each payload here comes in two halves:
 *
 *   <Name>Payload   the type the app codes against
 *   <name>Payload   a Zod schema, run through parseRpcPayload() at the one
 *                   place the data crosses from the database into the app
 *
 * The schemas check the SHAPE the app actually branches on — the counters, the
 * summary objects, the presence of each list. They deliberately do not re-check
 * every column of every row in those lists: those rows are ordinary table rows
 * the database already constrains, and field-level validation of them would
 * break the dashboard the first time a migration adds a column. Numbers are
 * coerced, because a Postgres `numeric` can arrive as either a JSON number or
 * a string depending on how it was aggregated.
 */
import { z } from "zod";

import type { PayrollRunStatus, Tables } from "@/lib/database.types";

// Row aliases, via the generated `Tables<>` helper rather than the generator's
// internal names — so regenerating the schema file cannot break this one.
type ActivityLogRow = Tables<"activity_logs">;
type ItemRow = Tables<"items">;
type OrderRow = Tables<"orders">;
type PayrollRunLineRow = Tables<"payroll_run_lines">;
type ProductionAssignmentRow = Tables<"production_assignments">;
type ProductionAssignmentMemberRow = Tables<"production_assignment_members">;

/**
 * The one place a jsonb RPC result becomes a typed value. Throws with the RPC
 * name attached, so a shape drift after a migration is immediately legible
 * instead of surfacing as `undefined is not an object` three components deep.
 */
export function parseRpcPayload<T>(
  schema: z.ZodType<T>,
  data: unknown,
  rpc: string,
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const where = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(
      `${rpc}() returned an unexpected payload — ${where}. ` +
        `The migration and src/lib/db/contracts.ts have drifted apart.`,
    );
  }
  return result.data;
}

/** A Postgres numeric: a JSON number, or a string when it came from sum(). */
const num = z.coerce.number();
/** A list of table rows: checked for being a list, not field by field. */
const rows = <T>() => z.array(z.unknown()).transform((r) => r as T[]);

// ── my_distribution_summary() / distribution_summary()  (0061, 0066) ────────
export const distributionSummaryPayload = z.object({
  openDraws: num,
  openAmount: num,
  settledDraws: num,
  settledAmount: num,
});
export type DistributionSummaryPayload = z.infer<
  typeof distributionSummaryPayload
>;

// ── admin_dashboard()  (0056, extended by 0063) ─────────────────────────────
export const adminDashboardPayload = z.object({
  kpis: z.object({
    activeMembers: num,
    newActiveMembers7d: num,
    orders7d: num,
    ordersPrev7d: num,
    completedOrders: num,
    completedOrders7d: num,
    lowStock: num,
    companyCash: num,
    cashNet7d: num,
  }),
  attention: z.object({
    paymentsToVerify: num,
    toProcess: num,
    toDistribute: num,
    productionUnpaid: num,
    openDraws: num,
    outstandingDebt: num,
    submissionsToReview: num,
    membersNotSubmitted: num,
  }),
  orderTrend: z.array(z.object({ date: z.string(), count: num })),
  recentActivity:
    rows<Pick<ActivityLogRow, "id" | "verb" | "summary" | "created_at">>(),
  lowStockItems: rows<
    Pick<ItemRow, "id" | "name" | "low_stock_threshold"> & {
      current_quantity: number;
    }
  >(),
  recentOrders: rows<
    Pick<
      OrderRow,
      "id" | "order_number" | "created_at" | "total" | "status" | "paid_to_name"
    > & { member_name: string }
  >(),
});
export type AdminDashboardPayload = z.infer<typeof adminDashboardPayload>;

// ── member_dashboard()  (0050, extended by 0063) ────────────────────────────
// The row lists are typed by their consumers in src/lib/db/dashboard.ts, which
// owns the Order / Notification / submission-alert aliases.
export const memberDashboardPayload = z.object({
  open: num,
  completed: num,
  completed7d: num,
  unread: num,
  distribution: distributionSummaryPayload,
  submissionState: z.string(),
  periodMonth: z.string(),
  activeOrders: rows<unknown>(),
  recentOrders: rows<unknown>(),
  recentNotifications: rows<unknown>(),
  submissionDebt: z.array(z.string()),
});

// ── cash_summary()  (0057) ──────────────────────────────────────────────────
export const cashSummaryPayload = z.object({
  incomeTotal: num,
  expenseTotal: num,
  net: num,
  entryCount: num,
});
export type CashSummaryPayload = z.infer<typeof cashSummaryPayload>;

// ── my_production_assignments()  (0075) ─────────────────────────────────────
// One page of the caller's own jobs, each with exactly one crew line — their
// own. Ownership, filtering, ordering, paging and the count all happen in SQL.
export const myProductionAssignmentsPayload = z.object({
  rows: rows<
    ProductionAssignmentRow & { crew: ProductionAssignmentMemberRow[] }
  >(),
  total: num,
});
export type MyProductionAssignmentsPayload = z.infer<
  typeof myProductionAssignmentsPayload
>;

// ── item_delete_impact()  (0076) ────────────────────────────────────────────
// Advisory only. delete_item re-checks every blocker under a row lock; nothing
// here is an authorization decision and none of it is sent back to the server.
export const itemDeleteImpact = z.object({
  itemId: z.string(),
  itemName: z.string(),
  blockers: z.object({
    orderLines: num,
    draws: num,
    submissionMaterial: num,
  }),
  clears: z.object({
    stockMovements: num,
    onHand: num,
    productionAssignments: num,
    supplierListings: num,
    distributionRate: num,
  }),
});
export type ItemDeleteImpact = z.infer<typeof itemDeleteImpact>;

// ── dormant piece-rate module (0057) ────────────────────────────────────────
// Nothing in the app reads these any more (the assignment board replaced the
// module), but the RPCs still exist and still carry their RLS. Kept so the
// contracts stay beside the functions rather than rotting in a deleted file.
export type EarningsSummaryPayload = {
  pendingCount: number;
  pendingAmount: number;
  approvedUnpaidAmount: number;
  paidAmount: number;
};
export type PayslipPayload = PayrollRunLineRow & {
  run_number: string;
  period_start: string;
  period_end: string;
  run_status: PayrollRunStatus;
};
