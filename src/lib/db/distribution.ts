import "server-only";

import type { Tables } from "@/lib/database.types";
import {
  distributionSummaryPayload,
  parseRpcPayload,
  type DistributionSummaryPayload,
} from "@/lib/db/contracts";
import { getMemberNames } from "@/lib/db/members";
import { chunk, ID_CHUNK, pageBounds, readAllRows } from "@/lib/db/paging";
import { createClient } from "@/lib/supabase/server";
import type { DrawListScope } from "@/lib/validation/distribution";

export type Distribution = Tables<"distributions">;

export const DISTRIBUTION_PAGE_SIZE = 20;

const SCOPE_STATUS = {
  open: "OPEN",
  settled: "SETTLED",
} as const;

type RateRow = Pick<
  Tables<"distribution_rates">,
  "item_id" | "unit_rate" | "updated_at"
>;

/** Every company cut. One row per drawable item, read in bounded batches. */
async function readAllRates(): Promise<RateRow[]> {
  const supabase = await createClient();
  return readAllRows((from, to) =>
    supabase
      .from("distribution_rates")
      .select("item_id, unit_rate, updated_at")
      .order("item_id", { ascending: true })
      .range(from, to),
  );
}

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
  const rates = await readAllRates();
  if (rates.length === 0) return [];

  const rateByItem = new Map(rates.map((r) => [r.item_id, r.unit_rate]));
  const qtyByItem = new Map<string, number>();
  const items: { id: string; name: string; unit: DrawableItem["unit"] }[] = [];

  // Small id groups instead of one `in (<every cut>)` list.
  for (const ids of chunk([...rateByItem.keys()], ID_CHUNK)) {
    const [itemsRes, stockRes] = await Promise.all([
      supabase
        .from("items")
        .select("id, name, unit")
        .in("id", ids)
        .is("archived_at", null),
      supabase
        .from("inventory")
        .select("item_id, current_quantity")
        .in("item_id", ids),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (stockRes.error) throw stockRes.error;
    items.push(...(itemsRes.data ?? []));
    for (const s of stockRes.data ?? []) {
      qtyByItem.set(s.item_id, s.current_quantity);
    }
  }

  return items
    .map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      unit_rate: rateByItem.get(i.id)!,
      current_quantity: qtyByItem.get(i.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
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
  const rates = await readAllRates();
  if (rates.length === 0) return [];

  const byItem = new Map<
    string,
    Pick<Tables<"items">, "id" | "name" | "unit" | "stock_type">
  >();
  for (const ids of chunk(
    rates.map((r) => r.item_id),
    ID_CHUNK,
  )) {
    const { data, error } = await supabase
      .from("items")
      .select("id, name, unit, stock_type")
      .in("id", ids);
    if (error) throw error;
    for (const i of data ?? []) byItem.set(i.id, i);
  }

  return rates
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
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.item_id.localeCompare(b.item_id),
    );
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
  const [items, rates] = await Promise.all([
    readAllRows((from, to) =>
      supabase
        .from("items")
        .select("id, name, unit, stock_type")
        .eq("category", "PRODUCT")
        .is("archived_at", null)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAllRates(),
  ]);

  const priced = new Set(rates.map((r) => r.item_id));
  return items.filter((i) => !priced.has(i.id));
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
  const pageSize = DISTRIBUTION_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

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

  const { data, error, count } = await query.range(from, to);
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
  return parseRpcPayload(
    distributionSummaryPayload,
    data,
    "my_distribution_summary",
  );
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
  const pageSize = DISTRIBUTION_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

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

  const { data, error, count } = await query.range(from, to);
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
  return parseRpcPayload(
    distributionSummaryPayload,
    data,
    "distribution_summary",
  );
}
