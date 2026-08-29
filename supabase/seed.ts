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

import type {
  Database,
  ItemCategory,
  ItemUnit,
  MemberRank,
} from "../src/lib/database.types";

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

const DOMAIN = "crimson.local";
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
  { username: "desmond_koll", displayName: "Desmond Koll", rank: "B" },
  { username: "priya_anand", displayName: "Priya Anand", rank: "SOLDIER" },
  { username: "tomas_iverson", displayName: "Tomas Iverson", rank: "SOLDIER" },
  { username: "reyna_voss", displayName: "Reyna Voss", rank: "SOLDIER" },
  { username: "callum_pike", displayName: "Callum Pike", rank: "B" },
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

// ── catalogue ─────────────────────────────────────────────────────────────
interface SeedItem {
  name: string;
  category: ItemCategory;
  unit: ItemUnit;
  price: number;
  threshold: number;
  orderable?: boolean;
  active?: boolean;
  opening: number;
}

const ITEMS: SeedItem[] = [
  {
    name: "Pistol",
    category: "WEAPON",
    unit: "UNIT",
    price: 4500,
    threshold: 5,
    opening: 24,
  },
  {
    name: "Combat Pistol",
    category: "WEAPON",
    unit: "UNIT",
    price: 6200,
    threshold: 5,
    opening: 12,
  },
  {
    name: "SMG",
    category: "WEAPON",
    unit: "UNIT",
    price: 14500,
    threshold: 3,
    opening: 8,
  },
  {
    name: "Carbine Rifle",
    category: "WEAPON",
    unit: "UNIT",
    price: 21000,
    threshold: 3,
    opening: 5,
  },
  {
    name: "Pump Shotgun",
    category: "WEAPON",
    unit: "UNIT",
    price: 9800,
    threshold: 4,
    opening: 9,
  },
  {
    name: "Pistol Rounds",
    category: "AMMO",
    unit: "ROUND",
    price: 6,
    threshold: 400,
    opening: 5200,
  },
  {
    name: "SMG Rounds",
    category: "AMMO",
    unit: "ROUND",
    price: 8,
    threshold: 400,
    opening: 3800,
  },
  {
    name: "Rifle Rounds",
    category: "AMMO",
    unit: "ROUND",
    price: 10,
    threshold: 300,
    opening: 2600,
  },
  {
    name: "Shotgun Shells",
    category: "AMMO",
    unit: "ROUND",
    price: 12,
    threshold: 200,
    opening: 1400,
  },
  {
    name: "Light Armor",
    category: "VEST",
    unit: "UNIT",
    price: 850,
    threshold: 15,
    opening: 60,
  },
  {
    name: "Heavy Armor",
    category: "VEST",
    unit: "UNIT",
    price: 1800,
    threshold: 10,
    opening: 34,
  },
  {
    name: "Refined Product",
    category: "PRODUCT",
    unit: "GRAM",
    price: 95,
    threshold: 250,
    opening: 1800,
  },
  {
    name: "Packaged Product",
    category: "PRODUCT",
    unit: "PACK",
    price: 2400,
    threshold: 20,
    opening: 46,
  },
  {
    name: "Burner Phone",
    category: "OTHER",
    unit: "UNIT",
    price: 300,
    threshold: 25,
    opening: 120,
  },
  {
    name: "Lockpick Set",
    category: "OTHER",
    unit: "PACK",
    price: 450,
    threshold: 15,
    opening: 8,
  },
  {
    name: "Prototype Rifle",
    category: "WEAPON",
    unit: "UNIT",
    price: 50000,
    threshold: 0,
    orderable: false,
    opening: 2,
  },
  {
    name: "Legacy Vest (discontinued)",
    category: "VEST",
    unit: "UNIT",
    price: 500,
    threshold: 0,
    active: false,
    opening: 0,
  },
];

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
    .from("items")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
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
    const email = `${person.username}@${DOMAIN}`;
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
  return data.map((row) => ({
    ...row,
    opening: ITEMS.find((i) => i.name === row.name)?.opening ?? 0,
  }));
}

async function clientFor(username: string) {
  const c = createClient<Database>(url!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({
    email: `${username}@${DOMAIN}`,
    password: password(username),
  });
  if (error) throw error;
  return c;
}

async function main() {
  await wipe();
  const members = await seedMembers();
  const items = await seedItems();

  const admins = members.filter((m) => m.person.isAdmin);
  const activeMembers = members.filter(
    (m) => !m.person.isAdmin && !m.person.inactive,
  );
  const orderable = items.filter(
    (i) => !["Prototype Rifle", "Legacy Vest (discontinued)"].includes(i.name),
  );

  // opening stock via the real RPC, as an admin
  console.log("Setting opening stock…");
  const adminClient = await clientFor(admins[0]!.person.username);
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
          it.name.includes("Rounds") || it.name.includes("Shells")
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
  const products = items.filter((i) =>
    ["Refined Product", "Packaged Product"].includes(i.name),
  );
  for (const p of products) {
    const rate = p.name === "Refined Product" ? 14 : 320;
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
          product.name === "Refined Product"
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

  console.log("\nSeed complete.");
  console.log(
    `  members : ${members.length} (${admins.length} admin, 1 inactive)`,
  );
  console.log(`  items   : ${items.length}`);
  console.log(`  orders  : ${orderIds.length}`);
  console.log(`  prod.   : ${logIds.length} logs`);
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
