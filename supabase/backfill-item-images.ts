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
import { announceTarget } from "./_env-guard";

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
  // ── weapons ──────────────────────────────────────────────────────────────
  { name: "Pistol Kacang", image: "WEAPON_PISTOL.png" },
  { name: "Pistol .50", image: "WEAPON_PISTOL50.png" },
  { name: "Ceramic Pistol", image: "WEAPON_CERAMICPISTOL.png" },
  { name: "Machine Pistol", image: "WEAPON_MACHINEPISTOL.png" },
  { name: "Mini SMG", image: "WEAPON_MINISMG.png" },
  { name: "Micro SMG", image: "WEAPON_MICROSMG.png" },
  { name: "Black Revolver", image: "WEAPON_REVOLVER.png" },
  { name: "Sawoff SG", image: "WEAPON_SAWNOFFSHOTGUN.png" },
  { name: "AKM", image: "WEAPON_ASSAULTRIFLE.png" },
  { name: "Virtus", image: "WEAPON_HEAVYRIFLE.png" },
  { name: "Carbine", image: "WEAPON_CARBINERIFLE.png" },
  { name: "X17", image: "WEAPON_HEAVYPISTOL.png" },
  { name: "Navy", image: "WEAPON_NAVYREVOLVER.png" },
  { name: "Shotgun", image: "WEAPON_PUMPSHOTGUN.png" },
  { name: "KVR", image: "WEAPON_SPECIALCARBINE.png" },
  // ── ammo ─────────────────────────────────────────────────────────────────
  { name: "Ammo 9mm", image: "ammo-9.png" },
  { name: "Ammo 380", image: "ammo-38.png" },
  { name: "Ammo 50", image: "ammo-50.png" },
  { name: "Ammo 5.56mm", image: "ammo-rifle.png" },
  { name: "Ammo 7.62mm", image: "ammo-rifle2.png" },
  { name: "Ammo Shotgun", image: "ammo-shotgun.png" },
  { name: "Ammo .44 Magnum", image: "ammo-44.png" },
  { name: "Ammo .45 ACP", image: "ammo-45.png" },
  // ── vests ────────────────────────────────────────────────────────────────
  { name: "Vest Merah", image: "armour.png" },
  { name: "Vest Biru", image: "armour.png" },
  // ── attachments (nearest ox_inventory component icon) ─────────────────────
  { name: "Grip", image: "at_grip.png" },
  { name: "Modern Grip 1", image: "at_grip.png" },
  { name: "Modern Grip 2", image: "at_grip.png" },
  { name: "Macro Scope", image: "at_scope_large.png" },
  { name: "Medium Scope", image: "at_scope_medium.png" },
  { name: "Holo Scope", image: "at_scope_holo.png" },
  { name: "Red Dot", image: "at_scope_small.png" },
  { name: "Modern Laser", image: "at_flashlight.png" },
  { name: "Tactical Flashlight", image: "at_flashlight.png" },
  { name: "Modern Flashlight", image: "at_flashlight.png" },
  { name: "Extended Pistol Clip", image: "at_clip_extended.png" },
  { name: "Extended SMG Clip", image: "at_clip_extended2.png" },
  { name: "Cylinder", image: "at_clip_drum.png" },
  { name: "Suppressor", image: "at_suppressor.png" },
  { name: "Tactical Suppressor", image: "at_suppressor.png" },
  { name: "Modern Suppressor Short", image: "at_muzzle_tactical.png" },
  { name: "Modern Suppressor Long", image: "at_suppressor.png" },
  { name: "SMG Drum", image: "at_clip_drum.png" },
  { name: "Modern Extended Clip 1", image: "at_clip_extended.png" },
  { name: "Modern Extended Clip 2", image: "at_clip_extended2.png" },
  { name: "Extended Rifle Clip", image: "at_clip_extended.png" },
  { name: "Modern Extended Drum", image: "at_clip_drum.png" },
  { name: "Rifle Drum", image: "at_clip_drum.png" },
  // ── product / procurement ───────────────────────────────────────────────
  { name: "Bibit", image: "weed.png" },
  { name: "Baggy", image: "weed.png" },
  { name: "Morphine", image: "cocaine.png" },
  { name: "Meth set", image: "cocaine.png" },
  { name: "Lockpick", image: "lockpick.png" },
  // Stock, drills, thermite, ovens, Green Card etc. have no clean upstream
  // icon — the script reports them under "no mapping"; fill in a later pass.
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
  announceTarget("db:item-images");
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
