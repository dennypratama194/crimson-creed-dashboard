/**
 * Development seed data (PRD §30). Fictional only — never real personal data.
 *
 *   npm run db:seed        (reads .env.local via tsx --env-file)
 *
 * Requires a linked/hosted Supabase project with migrations already pushed:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotency: this script is destructive for seeded data. It deletes existing
 * members/items/orders (and cascades) before reinserting. Do not run against a
 * database that holds anything you want to keep.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database, MemberRank } from "../src/lib/database.types";
import { assertSafeToWipe } from "./_env-guard";
import { usernameToEmail } from "../src/lib/auth/member-credentials";
import {
  CATALOGUE_ITEMS,
  SUPPLIER_ITEMS,
  SUPPLIERS,
  type SeedItem,
} from "./catalogue-data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and " +
      "SUPABASE_SERVICE_ROLE_KEY in .env.local before running the seed.",
  );
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const rand = <T>(xs: readonly T[]): T =>
  xs[Math.floor(Math.random() * xs.length)]!;
const chance = (p: number) => Math.random() < p;

// ── people ────────────────────────────────────────────────────────────────
interface SeedPerson {
  username: string;
  displayName: string;
  rank: MemberRank;
  isAdmin?: boolean;
  inactive?: boolean;
}

const PEOPLE: SeedPerson[] = [
  {
    username: "vincent_crane",
    displayName: "Vincent Crane",
    rank: "BOSS",
    isAdmin: true,
  },
  {
    username: "marlow_dietrich",
    displayName: "Marlow Dietrich",
    rank: "UNDER_BOSS",
    isAdmin: true,
  },
  { username: "sable_ruiz", displayName: "Sable Ruiz", rank: "SECRETARY" },
  { username: "desmond_koll", displayName: "Desmond Koll", rank: "CAPOREGIME" },
  { username: "priya_anand", displayName: "Priya Anand", rank: "SOLDIER" },
  { username: "tomas_iverson", displayName: "Tomas Iverson", rank: "SOLDIER" },
  { username: "reyna_voss", displayName: "Reyna Voss", rank: "SOLDIER" },
  { username: "callum_pike", displayName: "Callum Pike", rank: "CAPOREGIME" },
  { username: "nadia_frost", displayName: "Nadia Frost", rank: "SOLDIER" },
  { username: "erik_lang", displayName: "Erik Lang", rank: "SOLDIER" },
  { username: "mira_solano", displayName: "Mira Solano", rank: "SOLDIER" },
  { username: "otis_grange", displayName: "Otis Grange", rank: "SOLDIER" },
  { username: "lena_petrov", displayName: "Lena Petrov", rank: "SOLDIER" },
  {
    username: "hugo_marsh",
    displayName: "Hugo Marsh",
    rank: "SOLDIER",
    inactive: true,
  },
  { username: "bianca_reyes", displayName: "Bianca Reyes", rank: "SOLDIER" },
];

const password = (username: string) => `Crimson#${username.split("_")[0]}1`;

// ── catalogue + suppliers ──────────────────────────────────────────────
// Real data lives in ./catalogue-data.ts (shared with import-catalogue.ts).
const ITEMS: SeedItem[] = CATALOGUE_ITEMS;

async function wipe() {
  console.log("Clearing existing seed data…");
  await admin
    .from("orders")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("production_logs")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("payroll_runs")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("production_rates")
    .delete()
    .neq("item_id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("inventory_movements")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("member_submission_lines")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("member_submissions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("submission_period_targets")
    .delete()
    .neq("period_id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("submission_periods")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("supplier_items")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("suppliers")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("relations")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  // The three submission material types + their stock items are created by
  // migration 0033, not the seed. Keep those items (FK is ON DELETE RESTRICT).
  const { data: matItems } = await admin
    .from("submission_material_types")
    .select("inventory_item_id");
  const protectedItemIds = (matItems ?? []).map((r) => r.inventory_item_id);
  let itemsDelete = admin
    .from("items")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (protectedItemIds.length > 0) {
    itemsDelete = itemsDelete.not(
      "id",
      "in",
      `(${protectedItemIds.join(",")})`,
    );
  }
  await itemsDelete;
  await admin
    .from("notifications")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("activity_logs")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await admin
    .from("audit_logs")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  const { data: members } = await admin.from("members").select("user_id");
  for (const m of members ?? []) {
    await admin.auth.admin.deleteUser(m.user_id);
  }
  await admin
    .from("members")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
}

async function seedMembers() {
  console.log("Creating members…");
  const created: { person: SeedPerson; userId: string; memberId: string }[] =
    [];

  for (const person of PEOPLE) {
    const email = usernameToEmail(person.username);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: password(person.username),
      email_confirm: true,
    });
    if (error || !data.user)
      throw error ?? new Error(`createUser failed for ${email}`);

    const { data: member, error: mErr } = await admin
      .from("members")
      .insert({
        user_id: data.user.id,
        username: person.username,
        display_name: person.displayName,
        rank: person.rank,
        role: person.isAdmin ? "SUPER_ADMIN" : "MEMBER",
        status: person.inactive ? "INACTIVE" : "ACTIVE",
      })
      .select("id")
      .single();
    if (mErr || !member) throw mErr ?? new Error("member insert failed");

    created.push({ person, userId: data.user.id, memberId: member.id });
  }
  return created;
}

async function seedItems() {
  console.log("Creating catalogue…");
  const rows = ITEMS.map((i) => ({
    name: i.name,
    category: i.category,
    unit: i.unit,
    price: i.price,
    low_stock_threshold: i.threshold,
    orderable: i.orderable ?? true,
    active: i.active ?? true,
  }));
  const { data, error } = await admin
    .from("items")
    .insert(rows)
    .select("id, name");
  if (error || !data) throw error ?? new Error("item insert failed");
  return data.map((row) => {
    const src = ITEMS.find((i) => i.name === row.name);
    return {
      ...row,
      opening: src?.opening ?? 0,
      category: src?.category ?? "OTHER",
      orderable: src?.orderable ?? true,
      active: src?.active ?? true,
    };
  });
}

type SeededItem = Awaited<ReturnType<typeof seedItems>>[number];

async function seedSuppliers(items: SeededItem[]) {
  console.log("Creating suppliers…");
  const { data, error } = await admin
    .from("suppliers")
    .insert(SUPPLIERS.map((code) => ({ name: code })))
    .select("id, name");
  if (error || !data) throw error ?? new Error("supplier insert failed");

  const idByCode = new Map(data.map((s) => [s.name, s.id]));
  const idByItem = new Map(items.map((i) => [i.name, i.id]));

  const rows = SUPPLIER_ITEMS.map(([code, itemName, buy, sell, max]) => {
    const supplier_id = idByCode.get(code);
    const item_id = idByItem.get(itemName);
    if (!supplier_id) throw new Error(`unknown supplier code: ${code}`);
    if (!item_id)
      throw new Error(`supplier item has no catalogue match: ${itemName}`);
    return {
      supplier_id,
      item_id,
      buy_price: buy,
      sell_price: sell,
      max_quantity: max,
    };
  });

  const { error: linesError } = await admin.from("supplier_items").insert(rows);
  if (linesError) throw linesError;

  return { suppliers: data.length, lines: rows.length };
}

async function seedRelations(
  members: Awaited<ReturnType<typeof seedMembers>>,
  adminClient: Awaited<ReturnType<typeof clientFor>>,
) {
  console.log("Creating relations…");
  const names = [
    "Los Santos PD — Officer Reyes",
    "Vagos liaison — 'Tio'",
    "Harbour customs contact",
    "Vanilla Unicorn management",
    "Judge Harlan's clerk",
    "Chop shop — Sandy Shores",
  ];
  for (const [i, name] of names.entries()) {
    const joinedMs = Date.now() - (30 + i * 45) * 86_400_000;
    // through the RPC — a settled relation posts +250 Metal Scrap to the stash
    const { error } = await adminClient.rpc("create_relation", {
      p_name: name,
      p_joined_on: new Date(joinedMs).toISOString().slice(0, 10),
      p_notes: i % 2 === 0 ? "Introduced through the docks crew." : null,
      p_handler_member_id: members[i % members.length]?.memberId ?? undefined,
      p_metal_scrap_settled: i % 3 !== 0,
      p_oath_date:
        i % 2 === 0
          ? new Date(joinedMs + 14 * 86_400_000).toISOString().slice(0, 10)
          : undefined,
      p_blood_oath: i % 2 === 0,
    });
    if (error) throw error;
  }
  return names.length;
}

async function clientFor(username: string) {
  const c = createClient<Database>(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: usernameToEmail(username),
    password: password(username),
  });
  if (error) throw error;
  return c;
}

async function main() {
  assertSafeToWipe("db:seed");
  await wipe();
  const members = await seedMembers();
  const admins = members.filter((m) => m.person.isAdmin);
  const activeMembers = members.filter(
    (m) => !m.person.isAdmin && !m.person.inactive,
  );
  // an authed admin client — relations go through create_relation so a settled
  // one posts its metal-scrap prerequisite to the stash, like the real app
  const adminClient = await clientFor(admins[0]!.person.username);

  const items = await seedItems();
  const supplierCounts = await seedSuppliers(items);
  const relationCount = await seedRelations(members, adminClient);

  const orderable = items.filter((i) => i.orderable && i.active);

  // opening stock via the real RPC, as an admin
  console.log("Setting opening stock…");
  for (const item of items) {
    if (item.opening > 0) {
      const { error } = await adminClient.rpc("record_inventory_movement", {
        p_item_id: item.id,
        p_movement_type: "IN",
        p_quantity: item.opening,
        p_notes: "Opening balance",
      });
      if (error) throw error;
    }
  }

  // members place orders
  console.log("Placing orders…");
  const orderIds: string[] = [];
  for (const m of activeMembers) {
    const client = await clientFor(m.person.username);
    const n = 2 + Math.floor(Math.random() * 4); // 2–5 orders each
    for (let k = 0; k < n; k += 1) {
      const lineCount = 1 + Math.floor(Math.random() * 3);
      const picks = [...orderable]
        .sort(() => Math.random() - 0.5)
        .slice(0, lineCount);
      const p_items = picks.map((it) => ({
        item_id: it.id,
        quantity:
          it.category === "AMMO"
            ? 50 * (1 + Math.floor(Math.random() * 8))
            : 1 + Math.floor(Math.random() * 4),
      }));
      const { data, error } = await client.rpc("create_order", {
        p_items,
        p_note: chance(0.3) ? "Need this before the run tonight." : null,
      });
      if (error) throw error;
      if (data) orderIds.push(data.id);
    }
  }

  // admin advances a subset through the workflow
  console.log("Advancing orders…");
  for (const orderId of orderIds) {
    const roll = Math.random();
    if (roll < 0.15) {
      await adminClient.rpc("cancel_order", {
        p_order_id: orderId,
        p_reason: "Duplicate request",
      });
      continue;
    }
    if (roll < 0.25) {
      await adminClient.rpc("reject_order", {
        p_order_id: orderId,
        p_reason: "Insufficient funds on file",
      });
      continue;
    }

    await adminClient.rpc("submit_order_payment", { p_order_id: orderId });
    if (roll < 0.35) continue; // waiting on verification

    await adminClient.rpc("verify_order_payment", {
      p_order_id: orderId,
      p_note: "Confirmed in-game",
    });
    if (roll < 0.5) continue; // paid, not yet processing

    await adminClient.rpc("start_order_processing", { p_order_id: orderId });
    if (roll < 0.65) continue; // processing

    await adminClient.rpc("record_order_distribution", {
      p_order_id: orderId,
      p_note: "Handed over at the lock-up",
    });
    if (roll < 0.78) continue; // distributed, not closed

    await adminClient.rpc("complete_order", { p_order_id: orderId });
  }

  // a couple of manual stock corrections for the movement history
  await adminClient.rpc("adjust_inventory", {
    p_item_id: rand(items).id,
    p_target_quantity: 40,
    p_notes: "Physical count correction",
  });

  // ── production pay rates, logs, and a payroll run ────────────────────────
  console.log("Setting production pay rates…");
  const products = items.filter((i) => ["Bibit", "Morphine"].includes(i.name));
  for (const p of products) {
    const rate = p.name === "Bibit" ? 14 : 320;
    const { error } = await adminClient.rpc("set_production_rate", {
      p_item_id: p.id,
      p_unit_rate: rate,
    });
    if (error) throw error;
  }

  const logIds: string[] = [];
  if (products.length > 0) {
    console.log("Logging production…");
    for (const m of activeMembers) {
      const client = await clientFor(m.person.username);
      const n = 2 + Math.floor(Math.random() * 4); // 2–5 logs each
      for (let k = 0; k < n; k += 1) {
        const product = rand(products);
        const daysAgo = 3 + Math.floor(Math.random() * 40);
        const occurred = new Date(Date.now() - daysAgo * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const qty =
          product.name === "Bibit"
            ? 20 + Math.floor(Math.random() * 180)
            : 1 + Math.floor(Math.random() * 6);
        const { data, error } = await client.rpc("submit_production_log", {
          p_item_id: product.id,
          p_quantity: qty,
          p_occurred_at: `${occurred}T12:00:00Z`,
          p_note: chance(0.25) ? "West lab batch" : null,
        });
        if (error) throw error;
        if (data) logIds.push(data.id);
      }
    }

    console.log("Reviewing production…");
    for (const logId of logIds) {
      const roll = Math.random();
      if (roll < 0.15) continue; // leave pending
      const approve = roll >= 0.28;
      await adminClient.rpc("review_production_log", {
        p_log_id: logId,
        p_approve: approve,
        p_note: approve ? null : "Could not verify on the logs",
      });
    }

    console.log("Running payroll…");
    const now = new Date();
    const firstThis = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const lastPrev = new Date(firstThis.getTime() - 86_400_000);
    const firstPrev = new Date(
      Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1),
    );
    const { data: run, error: runErr } = await adminClient.rpc(
      "create_payroll_run",
      {
        p_period_start: firstPrev.toISOString().slice(0, 10),
        p_period_end: lastPrev.toISOString().slice(0, 10),
        p_note: "Monthly drug-lab wages",
      },
    );
    if (runErr) throw runErr;
    if (run)
      await adminClient.rpc("finalize_payroll_run", { p_run_id: run.id });
  }

  // ── monthly material submissions (current month only — the RPC is scoped) ──
  console.log("Seeding monthly material submissions…");
  const { data: materialTypes } = await adminClient
    .from("submission_material_types")
    .select("id, code");
  let submissionCount = 0;
  if (materialTypes && materialTypes.length > 0) {
    const thisMonth = new Date().toISOString().slice(0, 7);
    await adminClient.rpc("set_submission_targets", {
      p_period_month: `${thisMonth}-01`,
      p_targets: materialTypes.map((t) => ({
        material_type_id: t.id,
        target_quantity: t.code === "MS" ? 250 : 1000,
      })),
    });

    for (const m of activeMembers) {
      const client = await clientFor(m.person.username);
      const receiver = admins[Math.floor(Math.random() * admins.length)]!;
      const { data: sub, error } = await client.rpc(
        "submit_material_submission",
        {
          p_lines: materialTypes.map((t) => ({
            material_type_id: t.id,
            quantity:
              t.code === "MS"
                ? 200 + Math.floor(Math.random() * 260)
                : chance(0.4)
                  ? 1000
                  : 0,
          })),
          p_note: chance(0.2) ? "Dropped at the lock-up" : null,
          p_received_by: receiver.memberId,
        },
      );
      if (error) throw error;
      if (!sub) continue;
      submissionCount += 1;

      const roll = Math.random();
      if (roll < 0.2) continue; // leave pending
      if (roll < 0.32) {
        await adminClient.rpc("reject_member_submission", {
          p_submission_id: sub.id,
          p_reason: "Count did not match the scales — please recount",
        });
      } else {
        await adminClient.rpc("confirm_member_submission", {
          p_submission_id: sub.id,
          p_lines: null,
          p_note: null,
        });
      }
    }
  }

  console.log("\nSeed complete.");
  console.log(
    `  members : ${members.length} (${admins.length} admin, 1 inactive)`,
  );
  console.log(`  items   : ${items.length}`);
  console.log(
    `  supplier: ${supplierCounts.suppliers} suppliers, ${supplierCounts.lines} price-book lines`,
  );
  console.log(`  relation: ${relationCount}`);
  console.log(`  orders  : ${orderIds.length}`);
  console.log(`  prod.   : ${logIds.length} logs`);
  console.log(`  submits : ${submissionCount} material submissions`);
  console.log(
    "\nSign-in credentials (development only) — username / password:",
  );
  for (const m of members) {
    console.log(
      `  ${m.person.isAdmin ? "[admin] " : "        "}${m.person.username}  ${password(m.person.username)}`,
    );
  }
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
