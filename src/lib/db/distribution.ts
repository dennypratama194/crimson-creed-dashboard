import "server-only";

import type { DistributionSummaryPayload, Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
import { createClient } from "@/lib/supabase/server";
import type { DrawListScope } from "@/lib/validation/distribution";

export type Distribution = Tables<"distributions">;

export const DISTRIBUTION_PAGE_SIZE = 20;

const SCOPE_STATUS = {
  open: "OPEN",
  settled: "SETTLED",
} as const;

// ── drawable items ─────────────────────────────────────────────────────────
export type DrawableItem = {
  id: string;
  name: string;
  unit: Tables<"items">["unit"];
  unit_rate: number;
  current_quantity: number;
};

/**
 * Stash items that carry a company cut, with what is physically on hand. These
 * are the only things `issue_distribution` will release. Super Admin only —
 * RLS hides both non-catalogue items and `distribution_rates` from members.
 */
export async function getDrawableItems(): Promise<DrawableItem[]> {
  const supabase = await createClient();
  const { data: rates, error: ratesErr } = await supabase
    .from("distribution_rates")
    .select("item_id, unit_rate");
  if (ratesErr) throw ratesErr;

  const itemIds = (rates ?? []).map((r) => r.item_id);
  if (itemIds.length === 0) return [];

  const [{ data: items, error: itemsErr }, { data: stock, error: stockErr }] =
    await Promise.all([
      supabase
        .from("items")
        .select("id, name, unit")
        .in("id", itemIds)
        .is("archived_at", null),
      supabase
        .from("inventory")
        .select("item_id, current_quantity")
        .in("item_id", itemIds),
    ]);
  if (itemsErr) throw itemsErr;
  if (stockErr) throw stockErr;

  const rateByItem = new Map(
    (rates ?? []).map((r) => [r.item_id, r.unit_rate]),
  );
  const qtyByItem = new Map(
    (stock ?? []).map((s) => [s.item_id, s.current_quantity]),
  );

  return (items ?? [])
    .map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      unit_rate: rateByItem.get(i.id)!,
      current_quantity: qtyByItem.get(i.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── admin: the company cut list ────────────────────────────────────────────
export type DistributionRateRow = {
  item_id: string;
  name: string;
  unit: Tables<"items">["unit"];
  stock_type: Tables<"items">["stock_type"];
  unit_rate: number;
  updated_at: string;
};

/**
 * The cut list itself — only items that actually carry a rate. Removing a cut
 * drops the item off this page; the item itself stays in Company stash.
 */
export async function listDistributionRates(): Promise<DistributionRateRow[]> {
  const supabase = await createClient();
  const { data: rates, error: ratesErr } = await supabase
    .from("distribution_rates")
    .select("item_id, unit_rate, updated_at");
  if (ratesErr) throw ratesErr;
  if ((rates ?? []).length === 0) return [];

  const { data: items, error: itemsErr } = await supabase
    .from("items")
    .select("id, name, unit, stock_type")
    .in(
      "id",
      (rates ?? []).map((r) => r.item_id),
    );
  if (itemsErr) throw itemsErr;

  const byItem = new Map((items ?? []).map((i) => [i.id, i]));

  return (rates ?? [])
    .flatMap((r) => {
      const item = byItem.get(r.item_id);
      if (!item) return [];
      return [
        {
          item_id: r.item_id,
          name: item.name,
          unit: item.unit,
          stock_type: item.stock_type,
          unit_rate: r.unit_rate,
          updated_at: r.updated_at,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type PriceableItem = {
  id: string;
  name: string;
  unit: Tables<"items">["unit"];
  stock_type: Tables<"items">["stock_type"];
};

/**
 * Items that could carry a cut but do not yet — what the Add item picker
 * offers. PRODUCT category only (0070), the same rule the production
 * assignment picker uses; stock type is irrelevant, so a PRODUCT item is
 * drawable whether it is catalogue or stash.
 */
export async function listPriceableItems(): Promise<PriceableItem[]> {
  const supabase = await createClient();
  const [{ data: items, error: itemsErr }, { data: rates, error: ratesErr }] =
    await Promise.all([
      supabase
        .from("items")
        .select("id, name, unit, stock_type")
        .eq("category", "PRODUCT")
        .is("archived_at", null)
        .order("name", { ascending: true }),
      supabase.from("distribution_rates").select("item_id"),
    ]);
  if (itemsErr) throw itemsErr;
  if (ratesErr) throw ratesErr;

  const priced = new Set((rates ?? []).map((r) => r.item_id));
  return (items ?? []).filter((i) => !priced.has(i.id));
}

// ── member: my draws ───────────────────────────────────────────────────────
export async function listMyDistributions(options: {
  memberId: string;
  page?: number;
  scope?: DrawListScope;
}): Promise<{
  rows: Distribution[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = DISTRIBUTION_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  // Scope to the caller explicitly — a Super Admin's RLS view is every
  // member's draws, not just their own.
  let query = supabase
    .from("distributions")
    .select("*", { count: "exact" })
    .eq("member_id", options.memberId)
    .order("issued_at", { ascending: false })
    .order("id", { ascending: false });

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

/**
 * What the caller personally owes, summed in SQL by `my_distribution_summary()`
 * (0061) over their own draws only — caller-scoped even for a Super Admin, so
 * the member page never sums the whole organisation (same rule as 0057).
 */
export async function getMyDistributionSummary(): Promise<DistributionSummaryPayload> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_distribution_summary");
  if (error) throw error;
  return data;
}

// ── admin: the board ───────────────────────────────────────────────────────
export type AdminDistributionRow = Distribution & { member_name: string };

export async function listAdminDistributions(options: {
  page?: number;
  scope?: DrawListScope;
  memberId?: string;
  search?: string;
}): Promise<{
  rows: AdminDistributionRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = DISTRIBUTION_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("distributions")
    .select("*", { count: "exact" })
    .order("issued_at", { ascending: false })
    .order("id", { ascending: false });

  if (options.scope && options.scope !== "all") {
    query = query.eq("status", SCOPE_STATUS[options.scope]);
  }
  if (options.memberId) query = query.eq("member_id", options.memberId);

  const search = options.search
    ?.replace(/[,()%*]/g, " ")
    .trim()
    .slice(0, 60);
  if (search) {
    query = query.or(
      `item_name_snapshot.ilike.%${search}%,draw_number.ilike.%${search}%`,
    );
  }

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

/** Org-wide submitted / outstanding totals for the admin board (0066). */
export async function getDistributionSummary(): Promise<DistributionSummaryPayload> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("distribution_summary");
  if (error) throw error;
  return data;
}

export async function getDistribution(
  id: string,
): Promise<Distribution | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("distributions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
