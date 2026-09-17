import "server-only";

import type { ItemCategory } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { isUuid } from "@/lib/db/ids";
import { chunk, ID_CHUNK, pageBounds, readAllRows } from "@/lib/db/paging";
import { createClient } from "@/lib/supabase/server";
import type {
  SupplierListSort,
  SupplierListStatus,
} from "@/lib/validation/supplier";

export type Supplier = Tables<"suppliers">;
export type SupplierItem = Tables<"supplier_items">;

export const SUPPLIER_PAGE_SIZE = 20;
/** Suppliers per page of the grouped "By supplier" catalogue view. */
export const SUPPLIER_GROUP_PAGE_SIZE = 10;

/** A supplier row plus how many items it lists (and how many reach members). */
export type SupplierWithCounts = Supplier & {
  item_count: number;
  orderable_count: number;
};

type CatalogueItem = Pick<
  Tables<"items">,
  "name" | "category" | "unit" | "image_url" | "active" | "orderable"
>;

/** One price-book line joined to the catalogue item it points at. */
export type SupplierCatalogueLine = SupplierItem & { item: CatalogueItem };

export type SupplierGroup = {
  supplier: Supplier;
  lines: SupplierCatalogueLine[];
};

function sanitizeSearch(input: string): string {
  return input
    .replace(/[,()%*]/g, " ")
    .trim()
    .slice(0, 80);
}

const byCategoryThenName = (
  a: SupplierCatalogueLine,
  b: SupplierCatalogueLine,
) =>
  a.item.category.localeCompare(b.item.category) ||
  a.item.name.localeCompare(b.item.name) ||
  a.id.localeCompare(b.id);

/**
 * Every price-book line matching `filter`, read in batches ordered by id, then
 * joined to its item in small id groups. Neither side can be cut short by the
 * PostgREST row cap, however many lines a supplier carries.
 */
async function readCatalogueLines(
  filter: { supplierIds: string[] } | { itemId: string },
): Promise<SupplierItem[]> {
  const supabase = await createClient();

  if ("itemId" in filter) {
    return readAllRows((from, to) =>
      supabase
        .from("supplier_items")
        .select("*")
        .eq("item_id", filter.itemId)
        .order("id", { ascending: true })
        .range(from, to),
    );
  }

  const lines: SupplierItem[] = [];
  for (const ids of chunk(filter.supplierIds, ID_CHUNK)) {
    lines.push(
      ...(await readAllRows((from, to) =>
        supabase
          .from("supplier_items")
          .select("*")
          .in("supplier_id", ids)
          .order("id", { ascending: true })
          .range(from, to),
      )),
    );
  }
  return lines;
}

async function joinItems(
  lines: SupplierItem[],
): Promise<SupplierCatalogueLine[]> {
  if (lines.length === 0) return [];
  const supabase = await createClient();

  const itemById = new Map<string, CatalogueItem>();
  for (const ids of chunk(
    [...new Set(lines.map((l) => l.item_id))],
    ID_CHUNK,
  )) {
    const { data, error } = await supabase
      .from("items")
      .select("id, name, category, unit, image_url, active, orderable")
      .in("id", ids);
    if (error) throw error;
    for (const { id, ...rest } of data ?? []) itemById.set(id, rest);
  }

  return lines.flatMap((line) => {
    const item = itemById.get(line.item_id);
    return item ? [{ ...line, item }] : [];
  });
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

/** Every price-book line for one supplier, each joined to its catalogue item,
 *  ordered by item category then name. */
export async function getSupplierCatalogue(
  supplierId: string,
): Promise<SupplierCatalogueLine[]> {
  if (!isUuid(supplierId)) return [];
  const lines = await readCatalogueLines({ supplierIds: [supplierId] });
  return (await joinItems(lines)).sort(byCategoryThenName);
}

/**
 * The "by supplier" grouped view that mirrors the sourcing sheet, one page of
 * non-archived suppliers at a time, each with its complete catalogue.
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
  const { page, from, to } = pageBounds(options.page, pageSize);

  const { data, error, count } = await supabase
    .from("suppliers")
    .select("*", { count: "exact" })
    .is("archived_at", null)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to);
  if (error) throw error;

  const suppliers = data ?? [];
  const lines = await joinItems(
    await readCatalogueLines({ supplierIds: suppliers.map((s) => s.id) }),
  );

  const linesBySupplier = new Map<string, SupplierCatalogueLine[]>();
  for (const line of lines) {
    const list = linesBySupplier.get(line.supplier_id) ?? [];
    list.push(line);
    linesBySupplier.set(line.supplier_id, list);
  }

  return {
    groups: suppliers.map((supplier) => ({
      supplier,
      lines: (linesBySupplier.get(supplier.id) ?? []).sort(byCategoryThenName),
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** Which suppliers carry one catalogue item (item edit page panel). */
export type ItemSupplierLine = SupplierItem & {
  supplier: Pick<Supplier, "id" | "name" | "archived_at">;
};

export async function getItemSuppliers(
  itemId: string,
): Promise<ItemSupplierLine[]> {
  if (!isUuid(itemId)) return [];
  const lines = await readCatalogueLines({ itemId });
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

/** Non-archived catalogue items for the "add item to supplier" combobox. */
export async function listCatalogueItemsForPicker(): Promise<PickerItem[]> {
  const supabase = await createClient();
  return readAllRows((from, to) =>
    supabase
      .from("items")
      .select("id, name, category")
      .is("archived_at", null)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}
