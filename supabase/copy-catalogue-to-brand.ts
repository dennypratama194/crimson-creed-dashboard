/**
 * One-off: copy the CATALOGUE items (member-facing, priced) from one brand's
 * production project into another's — built for Crimson Creed → 30s Fams, but
 * takes the source project by env var so it isn't Crimson-specific.
 *
 *   npx tsx --env-file=.env.prod.local supabase/copy-catalogue-to-brand.ts
 *   npx tsx --env-file=.env.prod.local supabase/copy-catalogue-to-brand.ts --dry
 *
 * Env (the *target*, i.e. the brand you're copying INTO, comes from the
 * standard names so this reads the same --env-file as create-admin.ts /
 * import-catalogue.ts):
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  → target (written to)
 *   SOURCE_SUPABASE_URL / SOURCE_SUPABASE_SERVICE_ROLE_KEY → source (read only)
 *
 * What it does:
 *   - Reads every item on the source with stock_type = 'CATALOGUE' and
 *     archived_at is null (live catalogue only — soft-deleted items are not
 *     carried over).
 *   - Skips (by lowercased name) any item that already exists on the target,
 *     so a second run is safe.
 *   - Re-encodes and re-uploads each item's image into the TARGET's own
 *     item-images bucket via optimizeItemImage() (same helper the app uses),
 *     content-addressed by digest — a Crimson image URL is never written
 *     into another project's items row, since that project's next/image
 *     config only allows images from its own Supabase host.
 *   - Inserts the item directly into `items` (service role, bypasses RLS,
 *     same pattern as import-catalogue.ts / create-admin.ts). The
 *     `app.create_inventory_for_item` trigger provisions its `inventory` row;
 *     no opening stock is booked.
 *
 * Never touches suppliers, distribution rates, submissions, orders, members,
 * or anything on the source beyond a read. Writes no audit_logs row (same as
 * the other data scripts) — this is a one-time bootstrap, not an admin action.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";
import {
  optimizeItemImage,
  optimizedItemImagePath,
} from "../src/lib/images/optimize-item-image";
import { announceTarget } from "./_env-guard";

const DRY = process.argv.includes("--dry");
const ITEM_IMAGE_BUCKET = "item-images";
const ITEM_IMAGE_CACHE_SECONDS = "31536000";

const targetUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const targetKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sourceUrl = process.env.SOURCE_SUPABASE_URL;
const sourceKey = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;

if (!targetUrl || !targetKey) {
  console.error(
    "Missing target env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "(tsx reads them from the --env-file you pass) — this is the brand you're copying INTO.",
  );
  process.exit(1);
}
if (!sourceUrl || !sourceKey) {
  console.error(
    "Missing source env. Set SOURCE_SUPABASE_URL and SOURCE_SUPABASE_SERVICE_ROLE_KEY " +
      "in the same env file — this is the brand you're copying FROM.",
  );
  process.exit(1);
}
if (new URL(targetUrl).host === new URL(sourceUrl).host) {
  console.error("Source and target are the same project. Refusing to run.");
  process.exit(1);
}

const target = createClient<Database>(targetUrl, targetKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const source = createClient<Database>(sourceUrl, sourceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type SourceItem = {
  name: string;
  category: Database["public"]["Tables"]["items"]["Row"]["category"];
  description: string | null;
  sku: string | null;
  unit: Database["public"]["Tables"]["items"]["Row"]["unit"];
  price: number;
  active: boolean;
  orderable: boolean;
  low_stock_threshold: number;
  image_url: string | null;
};

async function fetchAndCopyImage(
  sourceImageUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(sourceImageUrl);
    if (!res.ok) return null;
    const optimized = await optimizeItemImage(await res.arrayBuffer());
    const path = optimizedItemImagePath(optimized.digest);
    const { error } = await target.storage
      .from(ITEM_IMAGE_BUCKET)
      .upload(path, optimized.bytes, {
        cacheControl: ITEM_IMAGE_CACHE_SECONDS,
        contentType: "image/webp",
        upsert: true, // content-addressed path — re-uploading the same bytes is a no-op
      });
    if (error) return null;
    return target.storage.from(ITEM_IMAGE_BUCKET).getPublicUrl(path).data
      .publicUrl;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log(`[copy-catalogue-to-brand] source: ${new URL(sourceUrl!).host}`);
  announceTarget("copy-catalogue-to-brand");
  if (DRY)
    console.log(
      "[copy-catalogue-to-brand] --dry: reporting only, writing nothing.\n",
    );

  const { data: rows, error } = await source
    .from("items")
    .select(
      "name, category, description, sku, unit, price, active, orderable, low_stock_threshold, image_url",
    )
    .eq("stock_type", "CATALOGUE")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw error;

  const items = (rows ?? []) as SourceItem[];
  console.log(`Found ${items.length} live catalogue item(s) on the source.\n`);
  if (items.length === 0) return;

  const { data: existingRows, error: existingError } = await target
    .from("items")
    .select("name");
  if (existingError) throw existingError;
  const existingNames = new Set(
    (existingRows ?? []).map((r) => r.name.trim().toLowerCase()),
  );

  let created = 0;
  let skipped = 0;
  let imagesCopied = 0;
  let imagesSkipped = 0;
  let failed = 0;

  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (existingNames.has(key)) {
      console.log(`  skip   (already exists) ${item.name}`);
      skipped += 1;
      continue;
    }

    let imageUrl: string | null = null;
    if (item.image_url) {
      if (DRY) {
        console.log(`  would copy image for ${item.name}`);
      } else {
        imageUrl = await fetchAndCopyImage(item.image_url);
        if (imageUrl) imagesCopied += 1;
        else imagesSkipped += 1;
      }
    }

    if (DRY) {
      console.log(
        `  would create ${item.name}  (${item.category}, ${formatMoney(item.price)})`,
      );
      created += 1;
      continue;
    }

    const { error: insertError } = await target.from("items").insert({
      name: item.name,
      category: item.category,
      description: item.description,
      sku: item.sku,
      unit: item.unit,
      price: item.price,
      active: item.active,
      orderable: item.orderable,
      low_stock_threshold: item.low_stock_threshold,
      image_url: imageUrl,
      stock_type: "CATALOGUE",
    });
    if (insertError) {
      console.error(`  FAILED ${item.name}: ${insertError.message}`);
      failed += 1;
      continue;
    }
    console.log(`  created ${item.name}`);
    created += 1;
  }

  console.log(
    `\n${DRY ? "Would create" : "Created"} ${created}, skipped ${skipped} (already existed)` +
      (failed > 0 ? `, ${failed} FAILED` : "") +
      (DRY
        ? ""
        : `. Images: ${imagesCopied} copied, ${imagesSkipped} skipped.`),
  );
  if (failed > 0) process.exitCode = 1;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

main().catch((err: unknown) => {
  console.error("\nFailed:", err);
  process.exit(1);
});
