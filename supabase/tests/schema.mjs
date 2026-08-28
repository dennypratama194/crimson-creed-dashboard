/**
 * Migration + RLS + RPC smoke test.
 *
 * Applies every file in supabase/migrations against an in-process PGlite
 * database (no Docker), stubs the Supabase `auth` schema, then exercises the
 * core roleplay workflow and the RLS boundaries. Run: `npm run db:test`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "migrations");

let pass = 0;
let fail = 0;
const failures = [];

function ok(name) {
  pass += 1;
  console.log(`  ✓ ${name}`);
}
function bad(name, err) {
  fail += 1;
  failures.push({ name, err });
  console.log(`  ✗ ${name}\n      ${err?.message ?? err}`);
}
async function expect(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    bad(name, err);
  }
}
async function expectThrows(name, fn, matcher) {
  try {
    await fn();
    bad(name, new Error("expected an error but the call succeeded"));
  } catch (err) {
    if (matcher && !new RegExp(matcher, "i").test(err.message)) {
      bad(name, new Error(`error did not match /${matcher}/: ${err.message}`));
    } else {
      ok(name);
    }
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const db = await PGlite.create();

async function asRole(role, sub) {
  await db.exec(`reset role;`);
  await db.exec(
    `select set_config('request.jwt.claim.sub', ${sub ? `'${sub}'` : "''"}, false);`,
  );
  if (role) await db.exec(`set role ${role};`);
}
async function one(sql, params) {
  const res = await db.query(sql, params);
  return res.rows[0];
}

// ── bootstrap: roles + stubbed Supabase auth schema ────────────────────────
await db.exec(`
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  grant anon, authenticated, service_role to "postgres";

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique
  );
  create or replace function auth.uid()
  returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`);

// ── apply migrations in order ─────────────────────────────────────────────
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`\nApplying ${files.length} migrations`);
for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  try {
    await db.exec(sql);
    ok(file);
  } catch (err) {
    bad(file, err);
    console.log("\nMigration failed — stopping.\n");
    printSummaryAndExit();
  }
}

// ── seed a tiny fixture as the table owner (bypasses RLS) ─────────────────
console.log("\nFixture");
const admin = await one(
  `insert into auth.users (email) values ('admin@test') returning id`,
);
const m1 = await one(
  `insert into auth.users (email) values ('m1@test') returning id`,
);
const m2 = await one(
  `insert into auth.users (email) values ('m2@test') returning id`,
);
const inactive = await one(
  `insert into auth.users (email) values ('ex@test') returning id`,
);

await db.query(
  `insert into members (user_id, username, display_name, role, status) values
     ($1,'admin_boss','Admin Boss','SUPER_ADMIN','ACTIVE'),
     ($2,'member_one','Member One','MEMBER','ACTIVE'),
     ($3,'member_two','Member Two','MEMBER','ACTIVE'),
     ($4,'ex_member','Ex Member','MEMBER','INACTIVE')`,
  [admin.id, m1.id, m2.id, inactive.id],
);

// member.id (referenced by orders/notifications) differs from auth.users.id
const memberId = {};
for (const u of [
  ["admin", admin.id],
  ["m1", m1.id],
  ["m2", m2.id],
]) {
  const row = await one(`select id from members where user_id = $1`, [u[1]]);
  memberId[u[0]] = row.id;
}

const item = await one(
  `insert into items (name, category, unit, price, low_stock_threshold)
   values ('9mm Rounds','AMMO','ROUND',2.50,20) returning id`,
);
const item2 = await one(
  `insert into items (name, category, unit, price, active, orderable)
   values ('Prototype Rifle','WEAPON','UNIT',5000,true,false) returning id`,
);
ok("fixture created");

await expect("inventory row auto-created for each item", async () => {
  const r = await one(`select count(*)::int n from inventory`);
  assert(r.n === 2, `expected 2 inventory rows, got ${r.n}`);
});

// ── auth predicates ──────────────────────────────────────────────────────
console.log("\nAuth predicates");
await asRole("authenticated", admin.id);
await expect("is_super_admin() true for active admin", async () => {
  const r = await one(`select app.is_super_admin() v`);
  assert(r.v === true, "expected true");
});
await asRole("authenticated", m1.id);
await expect("is_super_admin() false for member", async () => {
  const r = await one(`select app.is_super_admin() v`);
  assert(r.v === false, "expected false");
});
await asRole("authenticated", inactive.id);
await expect("is_active_member() false for INACTIVE member", async () => {
  const r = await one(`select app.is_active_member() v`);
  assert(r.v === false, "expected false");
});

// ── create_order ─────────────────────────────────────────────────────────
console.log("\ncreate_order");
await asRole("authenticated", m1.id);
let order;
await expect(
  "member creates a 2-line order; totals computed server-side",
  async () => {
    order = await one(`select * from create_order($1::jsonb, $2)`, [
      JSON.stringify([
        { item_id: item.id, quantity: 4 },
        { item_id: item.id, quantity: 2 }, // duplicate -> merged to 6
      ]),
      "Rush please",
    ]);
    assert(order.status === "PENDING", `status ${order.status}`);
    assert(
      order.payment_status === "UNPAID",
      `payment ${order.payment_status}`,
    );
    assert(
      Number(order.total) === 15,
      `total ${order.total} (expected 6 * 2.50)`,
    );
    const oi = await db.query(`select * from order_items where order_id = $1`, [
      order.id,
    ]);
    assert(
      oi.rows.length === 1,
      `expected 1 merged line, got ${oi.rows.length}`,
    );
    assert(
      Number(oi.rows[0].unit_price_snapshot) === 2.5,
      "price not snapshotted",
    );
    assert(
      oi.rows[0].item_name_snapshot === "9mm Rounds",
      "name not snapshotted",
    );
  },
);

await expectThrows(
  "create_order rejects a non-orderable item",
  () =>
    db.query(`select create_order($1::jsonb, null)`, [
      JSON.stringify([{ item_id: item2.id, quantity: 1 }]),
    ]),
  "not available to order",
);
await expectThrows(
  "create_order rejects quantity <= 0",
  () =>
    db.query(`select create_order($1::jsonb, null)`, [
      JSON.stringify([{ item_id: item.id, quantity: 0 }]),
    ]),
  "greater than zero",
);
await asRole("authenticated", inactive.id);
await expectThrows(
  "create_order rejects an INACTIVE member",
  () =>
    db.query(`select create_order($1::jsonb, null)`, [
      JSON.stringify([{ item_id: item.id, quantity: 1 }]),
    ]),
  "active members",
);

// price snapshot survives a catalogue price change
await asRole(null); // ground-truth checks as the table owner
await db.query(`update items set price = 99 where id = $1`, [item.id]);
await expect(
  "historical order_item price unchanged after catalogue edit",
  async () => {
    const oi = await one(
      `select unit_price_snapshot from order_items where order_id = $1`,
      [order.id],
    );
    assert(
      Number(oi.unit_price_snapshot) === 2.5,
      `snapshot drifted to ${oi.unit_price_snapshot}`,
    );
  },
);
await db.query(`update items set price = 2.50 where id = $1`, [item.id]);

// ── RLS: order visibility ────────────────────────────────────────────────
console.log("\nRLS — orders");
await asRole("authenticated", m2.id);
await expect("member_two cannot see member_one's order", async () => {
  const r = await one(`select count(*)::int n from orders`);
  assert(r.n === 0, `expected 0 visible orders, got ${r.n}`);
});
await expect("member_two cannot see member_one's order_items", async () => {
  const r = await one(`select count(*)::int n from order_items`);
  assert(r.n === 0, `expected 0, got ${r.n}`);
});
await asRole("authenticated", m1.id);
await expect("member_one sees exactly their own order", async () => {
  const r = await one(`select count(*)::int n from orders`);
  assert(r.n === 1, `expected 1, got ${r.n}`);
});
await asRole("authenticated", admin.id);
await expect("admin sees all orders", async () => {
  const r = await one(`select count(*)::int n from orders`);
  assert(r.n === 1, `expected 1, got ${r.n}`);
});

// ── RLS: inventory hidden from members ───────────────────────────────────
await asRole("authenticated", m1.id);
await expect("member cannot see inventory", async () => {
  const r = await one(`select count(*)::int n from inventory`);
  assert(r.n === 0, `expected 0, got ${r.n}`);
});

// ── payment + workflow ──────────────────────────────────────────────────
console.log("\nWorkflow");
await asRole("authenticated", m1.id);
await expect("member submits payment", async () => {
  const o = await one(`select * from submit_order_payment($1)`, [order.id]);
  assert(o.payment_status === "PAYMENT_SUBMITTED", o.payment_status);
});
await expectThrows(
  "member cannot verify payment",
  () => db.query(`select verify_order_payment($1, null)`, [order.id]),
  "Super Admin",
);
await asRole("authenticated", admin.id);
await expect("admin verifies payment with a note", async () => {
  const o = await one(`select * from verify_order_payment($1, $2)`, [
    order.id,
    "Confirmed in-game",
  ]);
  assert(o.payment_status === "PAID", o.payment_status);
  assert(o.payment_note === "Confirmed in-game", o.payment_note);
});
await expect("payment verification created an audit row", async () => {
  const r = await one(
    `select count(*)::int n from audit_logs where action = 'PAYMENT_VERIFIED' and entity_id = $1`,
    [order.id],
  );
  assert(r.n === 1, `expected 1 audit row, got ${r.n}`);
});
await asRole(null);
await expect("member_one was notified of payment confirmation", async () => {
  const r = await one(
    `select count(*)::int n from notifications where recipient_id = $1 and type = 'PAYMENT_CONFIRMED'`,
    [memberId.m1],
  );
  assert(r.n === 1, `expected 1, got ${r.n}`);
});
await asRole("authenticated", admin.id);

await expect("admin starts processing", async () => {
  const o = await one(`select * from start_order_processing($1)`, [order.id]);
  assert(o.status === "PROCESSING", o.status);
});
await asRole("authenticated", m1.id);
await expectThrows(
  "member cannot cancel once PROCESSING",
  () => db.query(`select cancel_order($1, null)`, [order.id]),
  "while it is still pending",
);

await asRole("authenticated", admin.id);
await expect("admin tops up stock (+50)", async () => {
  const inv = await one(
    `select * from record_inventory_movement($1,'IN',50,'restock')`,
    [item.id],
  );
  assert(inv.current_quantity === 50, `qty ${inv.current_quantity}`);
});
await expect(
  "distribution draws stock down by the ordered quantity",
  async () => {
    const o = await one(`select * from record_order_distribution($1, $2)`, [
      order.id,
      "Handed over at the docks",
    ]);
    assert(o.distribution_status === "DISTRIBUTED", o.distribution_status);
    const inv = await one(
      `select current_quantity from inventory where item_id = $1`,
      [item.id],
    );
    assert(
      inv.current_quantity === 44,
      `expected 44 (50 - 6), got ${inv.current_quantity}`,
    );
    const mv = await one(
      `select count(*)::int n from inventory_movements where reference_type='ORDER' and reference_id=$1`,
      [order.id],
    );
    assert(mv.n === 1, `expected 1 distribution movement, got ${mv.n}`);
  },
);
await expect("admin completes the order", async () => {
  const o = await one(`select * from complete_order($1)`, [order.id]);
  assert(o.status === "COMPLETED", o.status);
});
await expectThrows(
  "no arbitrary transition: completed order cannot be cancelled",
  () => db.query(`select cancel_order($1, 'oops')`, [order.id]),
  "cannot be cancelled",
);
await expect("full timeline was recorded", async () => {
  const r = await one(
    `select count(*)::int n from order_timeline where order_id = $1`,
    [order.id],
  );
  assert(r.n >= 6, `expected >= 6 timeline entries, got ${r.n}`);
});

// ── low stock notification ──────────────────────────────────────────────
console.log("\nLow stock");
await expect("dropping below threshold notifies admins", async () => {
  await db.query(`select record_inventory_movement($1,'OUT',-30,'shrinkage')`, [
    item.id,
  ]);
  const inv = await one(
    `select current_quantity from inventory where item_id = $1`,
    [item.id],
  );
  assert(inv.current_quantity === 14, `qty ${inv.current_quantity}`);
  const r = await one(
    `select count(*)::int n from notifications where type = 'LOW_STOCK' and reference_id = $1`,
    [item.id],
  );
  assert(r.n === 1, `expected 1 low-stock notification, got ${r.n}`);
});

// ── append-only enforcement ─────────────────────────────────────────────
console.log("\nAppend-only");
await asRole(null); // back to postgres/superuser — still must be blocked by trigger
await expectThrows(
  "audit_logs reject UPDATE (even as superuser)",
  () => db.query(`update audit_logs set action = 'ORDER_CREATED'`),
  "append-only",
);
await expectThrows(
  "order_items reject UPDATE",
  () => db.query(`update order_items set quantity = 999`),
  "append-only",
);
await expectThrows(
  "inventory_movements reject DELETE",
  () => db.query(`delete from inventory_movements`),
  "append-only",
);

// ── member self-update guard ───────────────────────────────────────────
console.log("\nMember self-service");
await asRole("authenticated", m1.id);
await expect("member can change own display_name", async () => {
  await db.query(`update members set display_name = 'Mo' where user_id = $1`, [
    m1.id,
  ]);
});
await expectThrows(
  "member cannot escalate own role",
  () =>
    db.query(`update members set role = 'SUPER_ADMIN' where user_id = $1`, [
      m1.id,
    ]),
  "display name",
);
await expect("member cannot update another member's row (RLS)", async () => {
  const res = await db.query(
    `update members set display_name = 'x' where user_id = $1`,
    [m2.id],
  );
  assert(
    res.affectedRows === 0,
    `expected 0 rows affected, got ${res.affectedRows}`,
  );
});

printSummaryAndExit();

function printSummaryAndExit() {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
