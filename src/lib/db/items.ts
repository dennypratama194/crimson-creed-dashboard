import "server-only";

import type { ItemCategory } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type { ItemListSort, ItemListStatus } from "@/lib/validation/item";

export type Item = Tables<"items">;

export const ITEM_PAGE_SIZE = 20;

/** Strip characters that would break a PostgREST `or=` filter expression. */
function sanitizeSearch(input: string): string {
  return input
    .replace(/[,()%*]/g, " ")
    .trim()
    .slice(0, 80);
}

export type ListItemsOptions = {
  page?: number;
  search?: string;
  category?: ItemCategory | "all";
  status?: ItemListStatus;
  sort?: ItemListSort;
};

export async function listItems(options: ListItemsOptions): Promise<{
  rows: Item[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = ITEM_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  // The catalogue screen is member-facing goods only; raw materials, tools and
  // seized stock live in the company stash (`/admin/inventory`).
  let query = supabase
    .from("items")
    .select("*", { count: "exact" })
    .eq("stock_type", "CATALOGUE");

  const status = options.status ?? "all";
  if (status === "archived") {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
    if (status === "active") query = query.eq("active", true);
    if (status === "inactive") query = query.eq("active", false);
  }

  if (options.category && options.category !== "all") {
    query = query.eq("category", options.category);
  }

  const search = options.search ? sanitizeSearch(options.search) : "";
  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
  }

  switch (options.sort ?? "name") {
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "recent":
      query = query.order("created_at", { ascending: false });
      break;
    default:
      query = query.order("name", { ascending: true });
  }

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0, page, pageSize };
}

export async function getItem(id: string): Promise<Item | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}
