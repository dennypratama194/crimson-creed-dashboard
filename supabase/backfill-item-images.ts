/**
 * Backfill catalogue thumbnails from the ox_inventory default image set.
 *
 *   npm run db:item-images            # only fills items with no image yet
 *   npm run db:item-images -- --force # replace existing image_url too
 *   npm run db:item-images -- --dry   # report only, write nothing
 *
 * Downloads the mapped PNGs from the upstream ox_inventory repo, uploads them to
 * the public `item-images` bucket under `catalogue/`, and sets items.image_url
 * by exact name match. Idempotent: the same file path is re-used per icon, so
 * re-running upserts rather than piling up copies.
 *
 * Requires the same env as the seed (reads .env.local via tsx --env-file):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Note: this writes items.image_url directly (service role, RLS bypassed) and
 * does NOT go through update_item, so no audit_logs row is produced — matching
 * how seed.ts provisions data. Use the admin UI for catalogue changes in prod.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "in .env.local before running this script.",
  );
  process.exit(1);
}

const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");

const BUCKET = "item-images";
const SOURCE_BASE =
  "https://raw.githubusercontent.com/overextended/ox_inventory/main/web/images";

/**
 * Catalogue item name (exact) -> ox_inventory image filename.
 * Product/ammo icons are visual stand-ins; swap the filename to retheme.
 */
const MAP: { name: string; image: string }[] = [
  { name: "Pistol", image: "WEAPON_PISTOL.png" },
  { name: "Combat Pistol", image: "WEAPON_COMBATPISTOL.png" },
  { name: "SMG", image: "WEAPON_SMG.png" },
  { name: "Carbine Rifle", image: "WEAPON_CARBINERIFLE.png" },
  { name: "Pump Shotgun", image: "WEAPON_PUMPSHOTGUN.png" },
  { name: "Prototype Rifle", image: "WEAPON_MILITARYRIFLE.png" },
  { name: "Pistol Rounds", image: "ammo-9.png" },
  { name: "SMG Rounds", image: "ammo-45.png" },
  { name: "Rifle Rounds", image: "ammo-rifle.png" },
  { name: "Shotgun Shells", image: "ammo-shotgun.png" },
  { name: "Light Armor", image: "armour.png" },
  { name: "Heavy Armor", image: "armour.png" },
  { name: "Legacy Vest (discontinued)", image: "armour.png" },
  { name: "Refined Product", image: "cocaine.png" },
  { name: "Packaged Product", image: "weed.png" },
  { name: "Burner Phone", image: "phone.png" },
  { name: "Lockpick Set", image: "lockpick.png" },
];

type ItemRow = { id: string; name: string; image_url: string | null };

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Download an icon once and upsert it into the bucket; return its public URL. */
async function publishIcon(image: string, cache: Map<string, string>) {
  const cached = cache.get(image);
  if (cached) return cached;

  const res = await fetch(`${SOURCE_BASE}/${image}`);
  if (!res.ok) {
    throw new Error(`Fetch ${image} failed: ${res.status} ${res.statusText}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = `catalogue/${image}`;

  if (!DRY) {
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true,
    });
    if (error) throw error;
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  cache.set(image, data.publicUrl);
  return data.publicUrl;
}

async function main() {
  const { data: items, error } = await admin
    .from("items")
    .select("id, name, image_url");
  if (error) throw error;

  const rowsAll: ItemRow[] = items ?? [];
  const byName = new Map<string, ItemRow[]>();
  for (const row of rowsAll) {
    const list = byName.get(row.name) ?? [];
    list.push(row);
    byName.set(row.name, list);
  }

  const iconCache = new Map<string, string>();
  let updated = 0;
  let skipped = 0;
  const missing: string[] = [];

  for (const entry of MAP) {
    const rows = byName.get(entry.name);
    if (!rows || rows.length === 0) {
      missing.push(entry.name);
      continue;
    }

    const publicUrl = await publishIcon(entry.image, iconCache);

    for (const row of rows) {
      if (row.image_url && !FORCE) {
        skipped += 1;
        continue;
      }
      if (!DRY) {
        const { error: upErr } = await admin
          .from("items")
          .update({ image_url: publicUrl })
          .eq("id", row.id);
        if (upErr) throw upErr;
      }
      console.log(`  ${DRY ? "[dry] " : ""}${entry.name}  ->  ${entry.image}`);
      updated += 1;
    }
  }

  const uncovered = rowsAll
    .filter((row) => !MAP.some((m) => m.name === row.name))
    .map((row) => row.name);

  console.log(`\nDone.${DRY ? " (dry run — nothing written)" : ""}`);
  console.log(`  updated : ${updated}`);
  console.log(`  skipped : ${skipped} (already had an image; use --force)`);
  if (missing.length) {
    console.log(`  no matching item in DB: ${missing.join(", ")}`);
  }
  if (uncovered.length) {
    console.log(`  catalogue items with no mapping: ${uncovered.join(", ")}`);
  }
}

main().catch((err) => {
  console.error("\nBackfill failed:", err);
  process.exit(1);
});
