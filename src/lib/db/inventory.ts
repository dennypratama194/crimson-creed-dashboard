import "server-only";

import type { StockType } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
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
> & {
  current_quantity: number;
  stock_state: StockState;
};

export const INVENTORY_PAGE_SIZE = 25;
export const MOVEMENT_PAGE_SIZE = 20;

/**
 * Stock levels for non-archived items. Search, stock-type filter, ordering and
 * pagination run in Postgres on `items`; quantities are then fetched for the
 * page's items only. (The dashboard's whole-stash low-stock count lives in
 * `admin_dashboard()`.)
 */
export async function listInventory(options: {
  page?: number;
  search?: string;
  stockType?: StockType | "all";
}): Promise<{
  rows: InventoryLine[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = INVENTORY_PAGE_SIZE;
  const start = (page - 1) * pageSize;

  let query = supabase
    .from("items")
    .select(
      "id, name, category, unit, low_stock_threshold, image_url, stock_type",
      { count: "exact" },
    )
    .is("archived_at", null)
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  // Literal substring match: escape LIKE wildcards, drop PostgREST's `*` alias.
  const search = options.search
    ?.replace(/\*/g, "")
    .trim()
    .slice(0, 60)
    .replace(/[\\%_]/g, (c) => `\\${c}`);
  if (search) query = query.ilike("name", `%${search}%`);
  if (options.stockType && options.stockType !== "all")
    query = query.eq("stock_type", options.stockType);

  const {
    data: items,
    error,
    count,
  } = await query.range(start, start + pageSize - 1);
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
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return null;

  const { data: inv } = await supabase
    .from("inventory")
    .select("current_quantity")
    .eq("item_id", itemId)
    .maybeSingle();

  const pageSize = MOVEMENT_PAGE_SIZE;
  const page = Math.max(1, movementPage);
  const start = (page - 1) * pageSize;

  const { data: movements, count } = await supabase
    .from("inventory_movements")
    .select("*", { count: "exact" })
    .eq("item_id", itemId)
    .order("created_at", { ascending: false })
    .range(start, start + pageSize - 1);

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
