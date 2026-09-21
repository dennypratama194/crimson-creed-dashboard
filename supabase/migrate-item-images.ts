/**
 * Non-destructively migrate legacy item-images objects to immutable WebP.
 *
 * Preview (default; downloads/processes but writes nothing):
 *   npm run db:migrate-item-images
 *
 * Apply to development/staging:
 *   npm run db:migrate-item-images -- --apply
 *
 * Apply to an explicitly marked production environment:
 *   npx tsx --env-file=.env.prod.local supabase/migrate-item-images.ts \
 *     --apply --confirm-production
 *
 * Only public files in this project's `item-images` bucket are eligible.
 * External URLs are reported and skipped. Originals are never deleted, so a
 * database URL can be restored while the old object remains in storage.
 * Like the existing backfill script, apply mode uses the service role and does
 * not add audit rows; this is a one-time maintenance operation, not routine UI.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";
import { readAllRows } from "../src/lib/db/paging";
import {
  ITEM_IMAGE_CACHE_SECONDS,
  ITEM_IMAGE_MAX_INPUT_BYTES,
  optimizeItemImage,
  optimizedItemImagePath,
  type OptimizedItemImage,
} from "../src/lib/images/optimize-item-image";
import { announceTarget } from "./_env-guard";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "before running this script.",
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const CONFIRM_PRODUCTION = process.argv.includes("--confirm-production");
const BUCKET = "item-images";
const storagePrefix = `/storage/v1/object/public/${BUCKET}/`;
const targetUrl = new URL(url);

if (
  APPLY &&
  process.env.SUPABASE_ENV?.trim().toLowerCase() === "production" &&
  !CONFIRM_PRODUCTION
) {
  console.error(
    "Refusing production writes without --confirm-production. Preview first, " +
      "then re-run with --apply --confirm-production.",
  );
  process.exit(1);
}

type ItemRow = { id: string; name: string; image_url: string | null };

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sourcePath(imageUrl: string): string | null {
  try {
    const parsed = new URL(imageUrl);
    if (parsed.origin !== targetUrl.origin) return null;
    if (!parsed.pathname.startsWith(storagePrefix)) return null;
    return decodeURIComponent(parsed.pathname.slice(storagePrefix.length));
  } catch {
    return null;
  }
}

async function downloadAndOptimize(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > ITEM_IMAGE_MAX_INPUT_BYTES) {
    throw new Error("source is larger than 2 MB");
  }
  return optimizeItemImage(await response.arrayBuffer());
}

async function main() {
  announceTarget("db:migrate-item-images");
  console.log(APPLY ? "Mode: APPLY" : "Mode: PREVIEW (no writes)");

  const items = await readAllRows<ItemRow>((from, to) =>
    admin
      .from("items")
      .select("id, name, image_url")
      .not("image_url", "is", null)
      .order("name")
      .order("id")
      .range(from, to),
  );

  const optimizedByUrl = new Map<string, OptimizedItemImage>();
  const uploaded = new Set<string>();
  let migrated = 0;
  let skippedOptimized = 0;
  let skippedExternal = 0;
  let failed = 0;

  for (const item of items) {
    if (!item.image_url) continue;
    const path = sourcePath(item.image_url);
    if (!path) {
      console.log(`  skip external: ${item.name}`);
      skippedExternal += 1;
      continue;
    }
    if (path.startsWith("optimized/") && path.endsWith(".webp")) {
      skippedOptimized += 1;
      continue;
    }

    try {
      let optimized = optimizedByUrl.get(item.image_url);
      if (!optimized) {
        optimized = await downloadAndOptimize(item.image_url);
        optimizedByUrl.set(item.image_url, optimized);
      }
      const newPath = optimizedItemImagePath(optimized.digest);
      const { data: publicData } = admin.storage
        .from(BUCKET)
        .getPublicUrl(newPath);

      if (APPLY) {
        if (!uploaded.has(newPath)) {
          const { error: uploadError } = await admin.storage
            .from(BUCKET)
            .upload(newPath, optimized.bytes, {
              cacheControl: ITEM_IMAGE_CACHE_SECONDS,
              contentType: "image/webp",
              upsert: true,
            });
          if (uploadError) throw uploadError;
          uploaded.add(newPath);
        }

        const { data: updated, error: updateError } = await admin
          .from("items")
          .update({ image_url: publicData.publicUrl })
          .eq("id", item.id)
          .eq("image_url", item.image_url)
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updated) {
          throw new Error("image URL changed while the migration was running");
        }
      }

      console.log(
        `  ${APPLY ? "migrated" : "would migrate"}: ${item.name} -> ${newPath} ` +
          `(${optimized.width}x${optimized.height}, ${optimized.bytes.byteLength} B)`,
      );
      migrated += 1;
    } catch (error) {
      console.error(
        `  failed: ${item.name}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      failed += 1;
    }
  }

  console.log("\nDone.");
  console.log(`  ${APPLY ? "migrated" : "would migrate"}: ${migrated}`);
  console.log(`  already optimized: ${skippedOptimized}`);
  console.log(`  external/skipped: ${skippedExternal}`);
  console.log(`  failed: ${failed}`);
  console.log("  originals deleted: 0");

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("\nImage migration failed:", error);
  process.exit(1);
});
