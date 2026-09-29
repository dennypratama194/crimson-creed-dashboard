import "server-only";

import type { ItemCategory } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import {
  parseRpcPayload,
  supplierAvailableItemsPayload,
  supplierCatalogueGroupsPayload,
  supplierCataloguePagePayload,
  type SupplierCatalogueLinePayload,
} from "@/lib/db/contracts";
import { isUuid } from "@/lib/db/ids";
import { chunk, ID_CHUNK, pageBounds, readAllRows } from "@/lib/db/paging";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import type {
  SupplierListSort,
  SupplierListStatus,
} from "@/lib/validation/supplier";

export type Supplier = Tables<"suppliers">;
export type SupplierItem = Tables<"supplier_items">;

export const SUPPLIER_PAGE_SIZE = 20;
/** Suppliers per page of the grouped "By supplier" catalogue view. */
export const SUPPLIER_GROUP_PAGE_SIZE = 10;
/** Lines shown on each card of the grouped view; the rest are a link away. */
export const SUPPLIER_GROUP_LINES = 10;
/** Price-book lines per page of a supplier's detail page. */
export const SUPPLIER_CATALOGUE_PAGE_SIZE = 25;
/** Rows per page of the Add item picker. */
export const SUPPLIER_PICKER_PAGE_SIZE = 20;

/** A supplier row plus how many items it lists (and how many reach members). */
export type SupplierWithCounts = Supplier & {
  item_count: number;
  orderable_count: number;
};

/** One price-book line joined to the catalogue item it points at. */
export type SupplierCatalogueLine = SupplierCatalogueLinePayload;

export type SupplierGroup = {
  supplier: Supplier;
  /** The first `SUPPLIER_GROUP_LINES` lines, in catalogue order. */
  lines: SupplierCatalogueLine[];
  /** Every line the supplier lists, not just the ones on the card. */
  lineCount: number;
};

function sanitizeSearch(input: string): string {
  return input
    .replace(/[,()%*]/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Every supplier line for one item, read in batches ordered by id — the item
 * edit page's "who supplies this" panel. Cannot be cut short by the PostgREST
 * row cap however many suppliers list the item.
 */
async function readItemSupplierLines(itemId: string): Promise<SupplierItem[]> {
  const supabase = await createClient();
  return readAllRows((from, to) =>
    supabase
      .from("supplier_items")
      .select("*")
      .eq("item_id", itemId)
      .order("id", { ascending: true })
      .range(from, to),
  );
}

export type ListSuppliersOptions = {
  page?: number | string;
  search?: string;
  status?: SupplierListStatus;
  sort?: SupplierListSort;
};

export async function listSuppliers(options: ListSuppliersOptions): Promise<{
  rows: SupplierWithCounts[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const pageSize = SUPPLIER_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

  let query = supabase.from("suppliers").select("*", { count: "exact" });

  const status = options.status ?? "all";
  if (status === "archived") {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
    if (status === "active") query = query.eq("active", true);
    if (status === "inactive") query = query.eq("active", false);
  }

  const search = options.search ? sanitizeSearch(options.search) : "";
  if (search) {
    query = query.ilike("name", `%${search}%`);
  }

  if ((options.sort ?? "name") === "recent") {
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  } else {
    query = query
      .order("name", { ascending: true })
      .order("id", { ascending: true });
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const suppliers = data ?? [];
  const counts = new Map<string, { total: number; orderable: number }>();

  // Counted in SQL (0080): the page is bounded, its suppliers' listings are not.
  if (suppliers.length > 0) {
    const { data: countRows, error: countError } = await supabase.rpc(
      "supplier_item_counts",
      { p_supplier_ids: suppliers.map((s) => s.id) },
    );
    if (countError) throw countError;
    for (const row of countRows ?? []) {
      counts.set(row.supplier_id, {
        total: row.item_count,
        orderable: row.orderable_count,
      });
    }
  }

  return {
    rows: suppliers.map((s) => ({
      ...s,
      item_count: counts.get(s.id)?.total ?? 0,
      orderable_count: counts.get(s.id)?.orderable ?? 0,
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** One supplier, or null when absent. Query failures throw. */
export async function getSupplier(id: string): Promise<Supplier | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type SupplierCataloguePage = {
  rows: SupplierCatalogueLine[];
  /** Every line the supplier lists. */
  total: number;
  /** Lines with a sell price, across the whole catalogue. */
  soldToMembers: number;
  page: number;
  pageSize: number;
};

/**
 * One page of a supplier's price book, each line joined to its catalogue item
 * and ordered by item category, item name, then line id — joined, ordered,
 * paged and counted in SQL by `supplier_catalogue_page()` (0082).
 */
export async function getSupplierCatalogue(
  supplierId: string,
  options: { page?: number | string } = {},
): Promise<SupplierCataloguePage> {
  const pageSize = SUPPLIER_CATALOGUE_PAGE_SIZE;
  const { page, from } = pageBounds(options.page, pageSize);
  if (!isUuid(supplierId)) {
    return { rows: [], total: 0, soldToMembers: 0, page, pageSize };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("supplier_catalogue_page", {
    p_supplier_id: supplierId,
    p_limit: pageSize,
    p_offset: from,
  });
  if (error) throw error;

  const payload = parseRpcPayload(
    supplierCataloguePagePayload,
    data,
    "supplier_catalogue_page",
  );
  return {
    rows: payload.rows,
    total: payload.total,
    soldToMembers: payload.soldToMembers,
    page,
    pageSize,
  };
}

/**
 * The "by supplier" grouped view that mirrors the sourcing sheet: one page of
 * non-archived suppliers, each with its first `SUPPLIER_GROUP_LINES` lines and
 * its real line count. Both the suppliers and their lines are bounded in SQL
 * (`supplier_catalogue_groups()`, 0082); the detail page pages the rest.
 */
export async function listSupplierGroups(options: {
  page?: number | string;
}): Promise<{
  groups: SupplierGroup[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const pageSize = SUPPLIER_GROUP_PAGE_SIZE;
  const { page, from } = pageBounds(options.page, pageSize);

  const { data, error } = await supabase.rpc("supplier_catalogue_groups", {
    p_limit: pageSize,
    p_offset: from,
    p_lines: SUPPLIER_GROUP_LINES,
  });
  if (error) throw error;

  const payload = parseRpcPayload(
    supplierCatalogueGroupsPayload,
    data,
    "supplier_catalogue_groups",
  );
  return { groups: payload.groups, total: payload.total, page, pageSize };
}

/** Which suppliers carry one catalogue item (item edit page panel). */
export type ItemSupplierLine = SupplierItem & {
  supplier: Pick<Supplier, "id" | "name" | "archived_at">;
};

export async function getItemSuppliers(
  itemId: string,
): Promise<ItemSupplierLine[]> {
  if (!isUuid(itemId)) return [];
  const lines = await readItemSupplierLines(itemId);
  if (lines.length === 0) return [];

  const supabase = await createClient();
  const byId = new Map<string, ItemSupplierLine["supplier"]>();
  for (const ids of chunk(
    [...new Set(lines.map((l) => l.supplier_id))],
    ID_CHUNK,
  )) {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name, archived_at")
      .in("id", ids);
    if (error) throw error;
    for (const s of data ?? []) byId.set(s.id, s);
  }

  return lines
    .flatMap((line) => {
      const supplier = byId.get(line.supplier_id);
      return supplier ? [{ ...line, supplier }] : [];
    })
    .sort(
      (a, b) =>
        a.supplier.name.localeCompare(b.supplier.name) ||
        a.id.localeCompare(b.id),
    );
}

export type PickerItem = { id: string; name: string; category: ItemCategory };

/**
 * One page of the Add item picker for a supplier: non-archived items the
 * supplier does not list anywhere in its catalogue, optionally narrowed by a
 * name fragment, in name order. Read on demand when the dialog opens
 * (`supplier_available_items()`, 0082), never with the page. A Route Handler
 * passes the client it authorized with.
 */
export async function listAvailableItemsForSupplier(
  supplierId: string,
  options: { search?: string; page?: number | string },
  client?: ServerClient,
): Promise<{
  rows: PickerItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const pageSize = SUPPLIER_PICKER_PAGE_SIZE;
  const { page, from } = pageBounds(options.page, pageSize);
  if (!isUuid(supplierId)) return { rows: [], total: 0, page, pageSize };

  const supabase = client ?? (await createClient());
  const search = options.search?.trim().slice(0, 80) || undefined;
  const { data, error } = await supabase.rpc("supplier_available_items", {
    p_supplier_id: supplierId,
    p_search: search,
    p_limit: pageSize,
    p_offset: from,
  });
  if (error) throw error;

  const payload = parseRpcPayload(
    supplierAvailableItemsPayload,
    data,
    "supplier_available_items",
  );
  return { rows: payload.rows, total: payload.total, page, pageSize };
}
