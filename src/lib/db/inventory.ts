import "server-only";

import type { StockType } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { isUuid } from "@/lib/db/ids";
import { getMemberNames } from "@/lib/db/members";
import { pageBounds } from "@/lib/db/paging";
import { stockState, type StockState } from "@/lib/stock";
import { createClient } from "@/lib/supabase/server";

export type InventoryLine = Pick<
  Tables<"items">,
  | "id"
  | "name"
  | "category"
  | "unit"
  | "low_stock_threshold"
  | "image_url"
  | "stock_type"
  | "archived_at"
> & {
  current_quantity: number;
  stock_state: StockState;
};

export const INVENTORY_PAGE_SIZE = 25;
export const MOVEMENT_PAGE_SIZE = 20;

/** Archived items are hidden by default; "archived" is how you get one back. */
export const INVENTORY_STATUSES = ["active", "archived", "all"] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

/**
 * Stock levels. Search, stock-type filter, ordering and pagination run in
 * Postgres on `items`; quantities are then fetched for the page's items only.
 * (The dashboard's whole-stash low-stock count lives in `admin_dashboard()`.)
 */
export async function listInventory(options: {
  page?: number;
  search?: string;
  stockType?: StockType | "all";
  status?: InventoryStatus;
}): Promise<{
  rows: InventoryLine[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const pageSize = INVENTORY_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

  let query = supabase
    .from("items")
    .select(
      "id, name, category, unit, low_stock_threshold, image_url, stock_type, archived_at",
      { count: "exact" },
    )
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  const status = options.status ?? "active";
  if (status === "active") query = query.is("archived_at", null);
  else if (status === "archived") query = query.not("archived_at", "is", null);

  // Literal substring match: escape LIKE wildcards, drop PostgREST's `*` alias.
  const search = options.search
    ?.replace(/\*/g, "")
    .trim()
    .slice(0, 60)
    .replace(/[\\%_]/g, (c) => `\\${c}`);
  if (search) query = query.ilike("name", `%${search}%`);
  if (options.stockType && options.stockType !== "all")
    query = query.eq("stock_type", options.stockType);

  const { data: items, error, count } = await query.range(from, to);
  if (error) throw error;

  const pageItems = items ?? [];
  const qtyByItem = new Map<string, number>();
  if (pageItems.length > 0) {
    const { data: inventory, error: inventoryError } = await supabase
      .from("inventory")
      .select("item_id, current_quantity")
      .in(
        "item_id",
        pageItems.map((i) => i.id),
      );
    if (inventoryError) throw inventoryError;
    for (const row of inventory ?? []) {
      qtyByItem.set(row.item_id, row.current_quantity);
    }
  }

  return {
    rows: pageItems.map((item) => {
      const qty = qtyByItem.get(item.id) ?? 0;
      return {
        ...item,
        current_quantity: qty,
        stock_state: stockState(qty, item.low_stock_threshold),
      };
    }),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export type InventoryMovementRow = Tables<"inventory_movements"> & {
  performed_by_name: string | null;
};

export async function getInventoryDetail(
  itemId: string,
  movementPage = 1,
): Promise<{
  item: Tables<"items">;
  currentQuantity: number;
  movements: InventoryMovementRow[];
  movementTotal: number;
  movementPage: number;
  movementPageSize: number;
} | null> {
  if (!isUuid(itemId)) return null;
  const supabase = await createClient();

  // Absence (no such item, or RLS hides it) is null -> 404. A failed query
  // throws: it must not render as a missing item or as zero stock.
  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) return null;

  const pageSize = MOVEMENT_PAGE_SIZE;
  const { page, from, to } = pageBounds(movementPage, pageSize);

  const [invRes, movementsRes] = await Promise.all([
    supabase
      .from("inventory")
      .select("current_quantity")
      .eq("item_id", itemId)
      .maybeSingle(),
    // One statement can post several movements for an item (a draw and its
    // reversal, a batch adjustment), so created_at ties; `id` settles them.
    supabase
      .from("inventory_movements")
      .select("*", { count: "exact" })
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  ]);
  if (invRes.error) throw invRes.error;
  if (movementsRes.error) throw movementsRes.error;
  const inv = invRes.data;
  const movements = movementsRes.data;
  const count = movementsRes.count;

  const names = await getMemberNames(
    (movements ?? [])
      .map((m) => m.performed_by)
      .filter((v): v is string => v !== null),
  );

  return {
    item,
    currentQuantity: inv?.current_quantity ?? 0,
    movements: (movements ?? []).map((m) => ({
      ...m,
      performed_by_name: m.performed_by
        ? (names.get(m.performed_by) ?? null)
        : null,
    })),
    movementTotal: count ?? 0,
    movementPage: page,
    movementPageSize: pageSize,
  };
}
