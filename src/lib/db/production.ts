import "server-only";

import type { ProductionAssignmentStatus } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type { ProductionListScope } from "@/lib/validation/production";

export type ProductionAssignment = Tables<"production_assignments">;
export type AssignmentMember = Tables<"production_assignment_members">;

/** A job with its crew. RLS decides how much of the crew the caller can see. */
export type ProductionAssignmentWithCrew = ProductionAssignment & {
  crew: AssignmentMember[];
};

export const PRODUCTION_ASSIGNMENT_PAGE_SIZE = 20;

const SCOPE_STATUS: Record<
  Exclude<ProductionListScope, "all">,
  ProductionAssignmentStatus
> = {
  unpaid: "UNPAID",
  paid: "PAID",
  cancelled: "CANCELLED",
};

// ── products an assignment can be raised against ───────────────────────────
export type AssignableProduct = {
  id: string;
  name: string;
  unit: Tables<"items">["unit"];
  stock_type: Tables<"items">["stock_type"];
};

/**
 * Non-archived PRODUCT items — what the org actually manufactures. Same rule as
 * the Company cut picker (`listPriceableItems`), so the two Operations
 * dropdowns agree on what counts as a product.
 */
export async function getAssignableProducts(): Promise<AssignableProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, unit, stock_type")
    .eq("category", "PRODUCT")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Attaches crew lines to a page of jobs in one extra round-trip rather than one
 * per row. A member's RLS view of the crew is only their own line.
 */
async function withCrew(
  rows: ProductionAssignment[],
): Promise<ProductionAssignmentWithCrew[]> {
  if (rows.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_assignment_members")
    .select("*")
    .in(
      "assignment_id",
      rows.map((r) => r.id),
    )
    .order("member_name_snapshot", { ascending: true });
  if (error) throw error;

  const byAssignment = new Map<string, AssignmentMember[]>();
  for (const line of data ?? []) {
    const list = byAssignment.get(line.assignment_id);
    if (list) list.push(line);
    else byAssignment.set(line.assignment_id, [line]);
  }

  return rows.map((r) => ({ ...r, crew: byAssignment.get(r.id) ?? [] }));
}

// ── member: my assignments (read-only) ─────────────────────────────────────
export async function listMyProductionAssignments(options: {
  memberId: string;
  page?: number;
  scope?: ProductionListScope;
}): Promise<{
  rows: ProductionAssignmentWithCrew[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = PRODUCTION_ASSIGNMENT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  // Scope to the caller explicitly — a Super Admin's RLS view is every job, not
  // just the ones they are on. The filter is the member's OWN crew line, so
  // "Paid" means "I have been paid", not "the whole crew has".
  let lineQuery = supabase
    .from("production_assignment_members")
    .select("assignment_id", { count: "exact" })
    .eq("member_id", options.memberId);

  // A crew line is only ever UNPAID or PAID — CANCELLED lives on the job.
  if (options.scope === "unpaid" || options.scope === "paid") {
    lineQuery = lineQuery.eq(
      "status",
      options.scope === "paid" ? "PAID" : "UNPAID",
    );
  }

  const { data: lines, error: linesErr } = await lineQuery;
  if (linesErr) throw linesErr;

  const ids = (lines ?? []).map((l) => l.assignment_id);
  if (ids.length === 0) return { rows: [], total: 0, page, pageSize };

  let query = supabase
    .from("production_assignments")
    .select("*", { count: "exact" })
    .in("id", ids)
    .order("assigned_at", { ascending: false })
    .order("id", { ascending: false });

  // A cancelled job hides its crew's paid state, so it is filtered on the job.
  if (options.scope === "cancelled") {
    query = query.eq("status", "CANCELLED");
  } else if (options.scope === "unpaid" || options.scope === "paid") {
    query = query.neq("status", "CANCELLED");
  }

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  return {
    rows: await withCrew(data ?? []),
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ── admin: the assignment board ────────────────────────────────────────────
export async function listAdminProductionAssignments(options: {
  page?: number;
  scope?: ProductionListScope;
  search?: string;
}): Promise<{
  rows: ProductionAssignmentWithCrew[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = PRODUCTION_ASSIGNMENT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("production_assignments")
    .select("*", { count: "exact" })
    .order("assigned_at", { ascending: false })
    .order("id", { ascending: false });

  if (options.scope && options.scope !== "all") {
    query = query.eq("status", SCOPE_STATUS[options.scope]);
  }

  const search = options.search
    ?.replace(/[,()%*]/g, " ")
    .trim()
    .slice(0, 60);
  if (search) query = query.ilike("item_name_snapshot", `%${search}%`);

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  return {
    rows: await withCrew(data ?? []),
    total: count ?? 0,
    page,
    pageSize,
  };
}
