/**
 * Non-destructive catalogue + supplier importer.
 *
 *   npm run db:catalogue                 # upsert everything
 *   npm run db:catalogue -- --dry        # report only, write nothing
 *   npm run db:catalogue -- --prune-lines # also drop price-book lines for the
 *                                         # 10 managed suppliers that are not in
 *                                         # the sheet (off by default)
 *
 * Unlike `npm run db:seed` this touches ONLY the catalogue:
 *   - items          — upsert by name (73 rows); leftover pre-launch placeholder
 *                      items are archived (soft delete, reversible in the UI)
 *   - suppliers      — insert any of the 10 sheet names that are missing;
 *                      existing ones are left exactly as they are (names you
 *                      set in the admin UI are preserved)
 *   - supplier_items — upsert by (supplier, item) — 99 price-book lines
 *
 * Members, orders, production, payroll, cash and submissions are NEVER touched.
 * Opening stock is NOT booked — run inventory movements from the admin UI.
 *
 * Runs as the service role (RLS bypassed), so — like seed.ts and
 * backfill-item-images.ts — it writes no audit_logs rows. Use the admin UI for
 * routine catalogue edits in production.
 *
 * Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";
import {
  CATALOGUE_ITEMS,
  LEGACY_PLACEHOLDER_ITEMS,
  SUPPLIER_ITEMS,
  SUPPLIERS,
  type SupplierCode,
} from "./catalogue-data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "in .env.local before running this script.",
  );
  process.exit(1);
}

const DRY = process.argv.includes("--dry");
const PRUNE_LINES = process.argv.includes("--prune-lines");

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function importItems(): Promise<Map<string, string>> {
  const { data: existing, error } = await admin
    .from("items")
    .select("id, name");
  if (error) throw error;

  const idByName = new Map<string, string>();
  for (const row of existing ?? []) {
    if (!idByName.has(row.name)) idByName.set(row.name, row.id);
  }

  let created = 0;
  let updated = 0;

  for (const item of CATALOGUE_ITEMS) {
    const fields = {
      category: item.category,
      unit: item.unit,
      price: item.price,
      low_stock_threshold: item.threshold,
      orderable: item.orderable ?? true,
      active: item.active ?? true,
    };
    const id = idByName.get(item.name);

    if (id) {
      if (!DRY) {
        const { error: upErr } = await admin
          .from("items")
          .update(fields)
          .eq("id", id);
        if (upErr) throw upErr;
      }
      updated += 1;
    } else {
      if (!DRY) {
        const { data, error: insErr } = await admin
          .from("items")
          .insert({ name: item.name, ...fields })
          .select("id")
          .single();
        if (insErr || !data) throw insErr ?? new Error(`insert ${item.name}`);
        idByName.set(item.name, data.id);
      } else {
        idByName.set(item.name, `dry-${item.name}`);
      }
      created += 1;
    }
  }

  console.log(`  items      : ${created} created, ${updated} updated`);
  return idByName;
}

/** Soft-delete any leftover placeholder items so the live catalogue is only
 *  the real sheet. Reversible in the admin UI (Restore). */
async function archiveLegacy() {
  const { data, error } = await admin
    .from("items")
    .select("id, name")
    .in("name", LEGACY_PLACEHOLDER_ITEMS)
    .is("archived_at", null);
  if (error) throw error;

  const stale = data ?? [];
  if (stale.length && !DRY) {
    const { error: upErr } = await admin
      .from("items")
      .update({
        archived_at: new Date().toISOString(),
        active: false,
        orderable: false,
      })
      .in(
        "id",
        stale.map((r) => r.id),
      );
    if (upErr) throw upErr;
  }
  console.log(
    `  legacy     : ${stale.length} placeholder item(s) archived` +
      (stale.length ? ` (${stale.map((r) => r.name).join(", ")})` : ""),
  );
}

async function importSuppliers(): Promise<Map<SupplierCode, string>> {
  const { data: existing, error } = await admin
    .from("suppliers")
    .select("id, name");
  if (error) throw error;

  const idByCode = new Map<string, string>();
  for (const row of existing ?? []) {
    idByCode.set(row.name.toUpperCase(), row.id);
  }

  let created = 0;
  const resolved = new Map<SupplierCode, string>();

  for (const code of SUPPLIERS) {
    const found = idByCode.get(code.toUpperCase());
    if (found) {
      resolved.set(code, found);
      continue;
    }
    if (!DRY) {
      const { data, error: insErr } = await admin
        .from("suppliers")
        .insert({ name: code })
        .select("id")
        .single();
      if (insErr || !data) throw insErr ?? new Error(`insert supplier ${code}`);
      resolved.set(code, data.id);
    } else {
      resolved.set(code, `dry-${code}`);
    }
    created += 1;
  }

  console.log(
    `  suppliers  : ${created} created, ${SUPPLIERS.length - created} already present`,
  );
  return resolved;
}

async function importSupplierItems(
  itemIdByName: Map<string, string>,
  supplierIdByCode: Map<SupplierCode, string>,
) {
  const rows = SUPPLIER_ITEMS.map(([code, itemName, buy, sell, max]) => {
    const supplier_id = supplierIdByCode.get(code);
    const item_id = itemIdByName.get(itemName);
    if (!supplier_id) throw new Error(`unknown supplier code: ${code}`);
    if (!item_id) {
      throw new Error(`supplier line has no catalogue item: "${itemName}"`);
    }
    return {
      supplier_id,
      item_id,
      buy_price: buy,
      sell_price: sell,
      max_quantity: max,
      active: true,
    };
  });

  if (!DRY) {
    const { error } = await admin
      .from("supplier_items")
      .upsert(rows, { onConflict: "supplier_id,item_id" });
    if (error) throw error;
  }
  console.log(`  price book : ${rows.length} lines upserted`);

  if (PRUNE_LINES) {
    const managed = [...supplierIdByCode.values()];
    const keep = new Set(rows.map((r) => `${r.supplier_id}:${r.item_id}`));
    const { data: current, error } = await admin
      .from("supplier_items")
      .select("id, supplier_id, item_id")
      .in("supplier_id", managed);
    if (error) throw error;

    const stale = (current ?? []).filter(
      (r) => !keep.has(`${r.supplier_id}:${r.item_id}`),
    );
    if (stale.length && !DRY) {
      const { error: delErr } = await admin
        .from("supplier_items")
        .delete()
        .in(
          "id",
          stale.map((r) => r.id),
        );
      if (delErr) throw delErr;
    }
    console.log(`  pruned     : ${stale.length} stale lines`);
  }
}

async function main() {
  console.log(
    DRY ? "Catalogue import — DRY RUN (no writes)\n" : "Catalogue import\n",
  );
  const itemIds = await importItems();
  await archiveLegacy();
  const supplierIds = await importSuppliers();
  await importSupplierItems(itemIds, supplierIds);
  console.log(
    DRY
      ? "\nDry run complete — nothing written."
      : "\nDone. Book opening stock from /admin/inventory when ready.",
  );
}

main().catch((err) => {
  console.error("\nImport failed:", err);
  process.exit(1);
});
