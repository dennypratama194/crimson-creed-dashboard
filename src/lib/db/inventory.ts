import "server-only";

import type { StockType } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
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
  stock_state: "ok" | "low" | "out";
};

export const INVENTORY_PAGE_SIZE = 25;
export const MOVEMENT_PAGE_SIZE = 20;

function stockState(
  qty: number,
  threshold: number,
): InventoryLine["stock_state"] {
  if (qty <= 0) return "out";
  if (threshold > 0 && qty <= threshold) return "low";
  return "ok";
}

/**
 * Stock levels for every non-archived item. A single org holds ~10-20 items
 * (PRD §30), so filter/sort/paginate happens in memory after a two-query join.
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
  /** Items not "ok" across the whole stash — powers the dashboard KPI, not
   *  shown on the stash page itself. */
  lowStockCount: number;
}> {
  const supabase = await createClient();

  const [{ data: items }, { data: inventory }] = await Promise.all([
    supabase
      .from("items")
      .select(
        "id, name, category, unit, low_stock_threshold, image_url, stock_type",
      )
      .is("archived_at", null)
      .order("name", { ascending: true }),
    supabase.from("inventory").select("item_id, current_quantity"),
  ]);

  const qtyByItem = new Map(
    (inventory ?? []).map((row) => [row.item_id, row.current_quantity]),
  );

  let lines: InventoryLine[] = (items ?? []).map((item) => {
    const qty = qtyByItem.get(item.id) ?? 0;
    return {
      ...item,
      current_quantity: qty,
      stock_state: stockState(qty, item.low_stock_threshold),
    };
  });

  const lowStockCount = lines.filter((l) => l.stock_state !== "ok").length;

  const search = options.search?.trim().toLowerCase();
  if (search)
    lines = lines.filter((l) => l.name.toLowerCase().includes(search));
  if (options.stockType && options.stockType !== "all")
    lines = lines.filter((l) => l.stock_type === options.stockType);

  const total = lines.length;
  const page = Math.max(1, options.page ?? 1);
  const pageSize = INVENTORY_PAGE_SIZE;
  const start = (page - 1) * pageSize;

  return {
    rows: lines.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    lowStockCount,
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
