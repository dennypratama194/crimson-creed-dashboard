import "server-only";

import type { ItemCategory } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type {
  SupplierListSort,
  SupplierListStatus,
} from "@/lib/validation/supplier";

export type Supplier = Tables<"suppliers">;
export type SupplierItem = Tables<"supplier_items">;

export const SUPPLIER_PAGE_SIZE = 20;

/** A supplier row plus how many items it lists (and how many reach members). */
export type SupplierWithCounts = Supplier & {
  item_count: number;
  orderable_count: number;
};

/** One price-book line joined to the catalogue item it points at. */
export type SupplierCatalogueLine = SupplierItem & {
  item: Pick<
    Tables<"items">,
    "name" | "category" | "unit" | "image_url" | "active" | "orderable"
  >;
};

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

export type ListSuppliersOptions = {
  page?: number;
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
  const page = Math.max(1, options.page ?? 1);
  const pageSize = SUPPLIER_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

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
    query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
  }

  if ((options.sort ?? "name") === "recent") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("name", { ascending: true });
  }

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  const suppliers = data ?? [];
  const counts = new Map<string, { total: number; orderable: number }>();

  if (suppliers.length > 0) {
    const { data: lines, error: linesError } = await supabase
      .from("supplier_items")
      .select("supplier_id, sell_price")
      .in(
        "supplier_id",
        suppliers.map((s) => s.id),
      );
    if (linesError) throw linesError;

    for (const line of lines ?? []) {
      const entry = counts.get(line.supplier_id) ?? { total: 0, orderable: 0 };
      entry.total += 1;
      if (line.sell_price !== null) entry.orderable += 1;
      counts.set(line.supplier_id, entry);
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

export async function getSupplier(id: string): Promise<Supplier | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** Every price-book line for one supplier, each joined to its catalogue item,
 *  ordered by item category then name. */
export async function getSupplierCatalogue(
  supplierId: string,
): Promise<SupplierCatalogueLine[]> {
  const supabase = await createClient();

  const { data: lines, error } = await supabase
    .from("supplier_items")
    .select("*")
    .eq("supplier_id", supplierId);
  if (error) throw error;
  if (!lines || lines.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, name, category, unit, image_url, active, orderable")
    .in(
      "id",
      lines.map((l) => l.item_id),
    );
  if (itemsError) throw itemsError;

  const byId = new Map((items ?? []).map((i) => [i.id, i]));

  return lines
    .map((line) => {
      const item = byId.get(line.item_id);
      if (!item) return null;
      const { id: _id, ...itemRest } = item;
      void _id;
      return { ...line, item: itemRest } satisfies SupplierCatalogueLine;
    })
    .filter((x): x is SupplierCatalogueLine => x !== null)
    .sort(
      (a, b) =>
        a.item.category.localeCompare(b.item.category) ||
        a.item.name.localeCompare(b.item.name),
    );
}

/** Every non-archived supplier with its full catalogue — powers the
 *  "by supplier" grouped view that mirrors the sourcing sheet. */
export async function listSupplierGroups(): Promise<SupplierGroup[]> {
  const supabase = await createClient();

  const { data: suppliers, error } = await supabase
    .from("suppliers")
    .select("*")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  if (!suppliers || suppliers.length === 0) return [];

  const { data: lines, error: linesError } = await supabase
    .from("supplier_items")
    .select("*")
    .in(
      "supplier_id",
      suppliers.map((s) => s.id),
    );
  if (linesError) throw linesError;

  const itemIds = [...new Set((lines ?? []).map((l) => l.item_id))];
  const { data: items, error: itemsError } = itemIds.length
    ? await supabase
        .from("items")
        .select("id, name, category, unit, image_url, active, orderable")
        .in("id", itemIds)
    : { data: [], error: null };
  if (itemsError) throw itemsError;

  const itemById = new Map((items ?? []).map((i) => [i.id, i]));
  const linesBySupplier = new Map<string, SupplierCatalogueLine[]>();

  for (const line of lines ?? []) {
    const item = itemById.get(line.item_id);
    if (!item) continue;
    const { id: _id, ...itemRest } = item;
    void _id;
    const list = linesBySupplier.get(line.supplier_id) ?? [];
    list.push({ ...line, item: itemRest });
    linesBySupplier.set(line.supplier_id, list);
  }

  return suppliers.map((supplier) => ({
    supplier,
    lines: (linesBySupplier.get(supplier.id) ?? []).sort(
      (a, b) =>
        a.item.category.localeCompare(b.item.category) ||
        a.item.name.localeCompare(b.item.name),
    ),
  }));
}

/** Which suppliers carry one catalogue item (item edit page panel). */
export type ItemSupplierLine = SupplierItem & {
  supplier: Pick<Supplier, "id" | "name" | "code" | "archived_at">;
};

export async function getItemSuppliers(
  itemId: string,
): Promise<ItemSupplierLine[]> {
  const supabase = await createClient();

  const { data: lines, error } = await supabase
    .from("supplier_items")
    .select("*")
    .eq("item_id", itemId);
  if (error) throw error;
  if (!lines || lines.length === 0) return [];

  const { data: suppliers, error: suppliersError } = await supabase
    .from("suppliers")
    .select("id, name, code, archived_at")
    .in(
      "id",
      lines.map((l) => l.supplier_id),
    );
  if (suppliersError) throw suppliersError;

  const byId = new Map((suppliers ?? []).map((s) => [s.id, s]));

  return lines
    .map((line) => {
      const supplier = byId.get(line.supplier_id);
      return supplier ? { ...line, supplier } : null;
    })
    .filter((x): x is ItemSupplierLine => x !== null)
    .sort((a, b) => a.supplier.name.localeCompare(b.supplier.name));
}

export type PickerItem = { id: string; name: string; category: ItemCategory };

/** Non-archived catalogue items for the "add item to supplier" combobox. */
export async function listCatalogueItemsForPicker(): Promise<PickerItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, category")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
