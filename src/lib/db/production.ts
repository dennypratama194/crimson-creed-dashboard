import "server-only";

import type { ProductionLogStatus } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
import { createClient } from "@/lib/supabase/server";
import type { ProductionListScope } from "@/lib/validation/production";

export type ProductionLog = Tables<"production_logs">;

export const PRODUCTION_LOG_PAGE_SIZE = 20;

const SCOPE_STATUS: Record<
  Exclude<ProductionListScope, "all">,
  ProductionLogStatus
> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};

// ── products a member can log against ───────────────────────────────────────
export type PayEligibleProduct = {
  id: string;
  name: string;
  unit: Tables<"items">["unit"];
  unit_rate: number;
};

/** PRODUCT items that have a pay rate set — the only things a member can log. */
export async function getPayEligibleProducts(): Promise<PayEligibleProduct[]> {
  const supabase = await createClient();
  const [{ data: rates, error: ratesErr }, { data: items, error: itemsErr }] =
    await Promise.all([
      supabase.from("production_rates").select("item_id, unit_rate"),
      supabase
        .from("items")
        .select("id, name, unit")
        .eq("category", "PRODUCT")
        .is("archived_at", null),
    ]);
  if (ratesErr) throw ratesErr;
  if (itemsErr) throw itemsErr;

  const rateByItem = new Map(
    (rates ?? []).map((r) => [r.item_id, r.unit_rate]),
  );

  return (items ?? [])
    .filter((i) => rateByItem.has(i.id))
    .map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      unit_rate: rateByItem.get(i.id)!,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── member: my logs + earnings ─────────────────────────────────────────────
export async function listMyProductionLogs(options: {
  page?: number;
  scope?: ProductionListScope;
}): Promise<{
  rows: ProductionLog[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = PRODUCTION_LOG_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("production_logs")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false });

  if (options.scope && options.scope !== "all") {
    query = query.eq("status", SCOPE_STATUS[options.scope]);
  }

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0, page, pageSize };
}

export type EarningsSummary = {
  pendingCount: number;
  pendingAmount: number;
  approvedUnpaidAmount: number;
  paidAmount: number;
};

/** Money-at-a-glance for the member production page. RLS scopes rows to self. */
export async function getMyEarningsSummary(): Promise<EarningsSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_logs")
    .select("status, payout_amount, payroll_run_id");
  if (error) throw error;

  const summary: EarningsSummary = {
    pendingCount: 0,
    pendingAmount: 0,
    approvedUnpaidAmount: 0,
    paidAmount: 0,
  };
  for (const row of data ?? []) {
    if (row.status === "PENDING") {
      summary.pendingCount += 1;
      summary.pendingAmount += row.payout_amount;
    } else if (row.status === "APPROVED") {
      if (row.payroll_run_id) summary.paidAmount += row.payout_amount;
      else summary.approvedUnpaidAmount += row.payout_amount;
    }
  }
  return summary;
}

// ── admin: rates ──────────────────────────────────────────────────────────
export type ProductionRateRow = {
  item_id: string;
  name: string;
  unit: Tables<"items">["unit"];
  unit_rate: number | null;
  updated_at: string | null;
};

/** Every non-archived PRODUCT item, with its pay rate (null = not set). */
export async function listProductionRates(): Promise<ProductionRateRow[]> {
  const supabase = await createClient();
  const [{ data: items, error: itemsErr }, { data: rates, error: ratesErr }] =
    await Promise.all([
      supabase
        .from("items")
        .select("id, name, unit")
        .eq("category", "PRODUCT")
        .is("archived_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("production_rates")
        .select("item_id, unit_rate, updated_at"),
    ]);
  if (itemsErr) throw itemsErr;
  if (ratesErr) throw ratesErr;

  const byItem = new Map(
    (rates ?? []).map((r) => [
      r.item_id,
      { unit_rate: r.unit_rate, updated_at: r.updated_at },
    ]),
  );

  return (items ?? []).map((i) => ({
    item_id: i.id,
    name: i.name,
    unit: i.unit,
    unit_rate: byItem.get(i.id)?.unit_rate ?? null,
    updated_at: byItem.get(i.id)?.updated_at ?? null,
  }));
}

// ── admin: review queue ───────────────────────────────────────────────────
export type AdminProductionLogRow = ProductionLog & { member_name: string };

export async function listAdminProductionLogs(options: {
  page?: number;
  status?: ProductionLogStatus;
  search?: string;
}): Promise<{
  rows: AdminProductionLogRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = PRODUCTION_LOG_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("production_logs")
    .select("*", { count: "exact" })
    .order("submitted_at", { ascending: false });

  if (options.status) query = query.eq("status", options.status);

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

  const rows = data ?? [];
  const names = await getMemberNames(rows.map((r) => r.member_id));

  return {
    rows: rows.map((r) => ({
      ...r,
      member_name: names.get(r.member_id) ?? "Unknown member",
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getPendingProductionCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("production_logs")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");
  return count ?? 0;
}
