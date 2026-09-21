import "server-only";

import type { ProductionAssignmentStatus } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import {
  myProductionAssignmentsPayload,
  parseRpcPayload,
} from "@/lib/db/contracts";
import { pageBounds, readAllRows } from "@/lib/db/paging";
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
  return readAllRows((from, to) =>
    supabase
      .from("items")
      .select("id, name, unit, stock_type")
      .eq("category", "PRODUCT")
      .is("archived_at", null)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Count eligible products for the board KPI without loading picker data. */
export async function countAssignableProducts(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("category", "PRODUCT")
    .is("archived_at", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * A crew is capped at 50 (create_production_assignment). A 20-job page could
 * therefore ask for 1000 crew lines in one request — exactly PostgREST's
 * default row cap, where the response would be silently truncated and jobs
 * would render with a short crew and no error. Asking in chunks keeps the
 * worst case at CREW_CHUNK x 50 rows, well under the cap.
 */
const CREW_CHUNK = 10;

/**
 * Attaches crew lines to a page of jobs in a small, bounded number of extra
 * round-trips rather than one per row. A member's RLS view of the crew is only
 * their own line; a Super Admin's is the whole crew.
 */
async function withCrew(
  rows: ProductionAssignment[],
): Promise<ProductionAssignmentWithCrew[]> {
  if (rows.length === 0) return [];

  const supabase = await createClient();
  const ids = rows.map((r) => r.id);
  const byAssignment = new Map<string, AssignmentMember[]>();

  for (let i = 0; i < ids.length; i += CREW_CHUNK) {
    const { data, error } = await supabase
      .from("production_assignment_members")
      .select("*")
      .in("assignment_id", ids.slice(i, i + CREW_CHUNK))
      .order("member_name_snapshot", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;

    for (const line of data ?? []) {
      const list = byAssignment.get(line.assignment_id);
      if (list) list.push(line);
      else byAssignment.set(line.assignment_id, [line]);
    }
  }

  return rows.map((r) => ({ ...r, crew: byAssignment.get(r.id) ?? [] }));
}

// ── member: my assignments (read-only) ─────────────────────────────────────
/**
 * One round-trip to `my_production_assignments()` (migration 0075), which does
 * ownership, filtering, ordering, paging and the count in SQL.
 *
 * This used to be two queries: fetch EVERY crew line belonging to the member,
 * map it to assignment ids, then `assignments where id in (<the whole list>)`.
 * Past PostgREST's row cap that list came back truncated with no error, so jobs
 * disappeared from the member's list and `total` under-counted to match.
 *
 * The RPC is caller-scoped through app.current_member_id() and takes no member
 * id at all — there is nothing here for a browser to widen — so a Super Admin
 * opening /production sees their own jobs like anyone else.
 *
 * The payload carries exactly one crew line per job — the caller's own, which
 * is all the 0067 RLS policy shows a MEMBER, and what the table renders as
 * "have I been paid".
 */
export async function listMyProductionAssignments(options: {
  page?: number;
  scope?: ProductionListScope;
}): Promise<{
  rows: ProductionAssignmentWithCrew[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const pageSize = PRODUCTION_ASSIGNMENT_PAGE_SIZE;
  const { page, from } = pageBounds(options.page, pageSize);

  const { data, error } = await supabase.rpc("my_production_assignments", {
    p_scope: options.scope ?? "all",
    p_limit: pageSize,
    p_offset: from,
  });
  if (error) throw error;

  const payload = parseRpcPayload(
    myProductionAssignmentsPayload,
    data,
    "my_production_assignments",
  );

  return { rows: payload.rows, total: payload.total, page, pageSize };
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
  const pageSize = PRODUCTION_ASSIGNMENT_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

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

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    rows: await withCrew(data ?? []),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** Count only the assignments needed for an admin KPI. Never hydrate crews. */
export async function countAdminProductionAssignments(options: {
  scope?: ProductionListScope;
  search?: string;
}): Promise<number> {
  const supabase = await createClient();
  let query = supabase
    .from("production_assignments")
    .select("id", { count: "exact", head: true });

  if (options.scope && options.scope !== "all") {
    query = query.eq("status", SCOPE_STATUS[options.scope]);
  }

  const search = options.search
    ?.replace(/[,()%*]/g, " ")
    .trim()
    .slice(0, 60);
  if (search) query = query.ilike("item_name_snapshot", `%${search}%`);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
