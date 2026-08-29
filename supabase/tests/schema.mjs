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

  -- minimal stand-in for Supabase Storage (0017 targets storage.buckets/objects)
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
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

// ── item catalogue RPCs ────────────────────────────────────────────────
console.log("\nItem catalogue");
await asRole("authenticated", m1.id);
await expectThrows(
  "member cannot create an item",
  () =>
    db.query(
      `select create_item('Hack','OTHER','UNIT',1,null,null,0,true,true)`,
    ),
  "Super Admin",
);
await asRole("authenticated", admin.id);
let catItem;
await expect(
  "admin creates an item (audit + inventory row + image)",
  async () => {
    catItem = await one(
      `select * from create_item($1,'VEST','UNIT',$2,$3,$4,$5,true,true,$6)`,
      [
        "Trauma Plate",
        1250,
        "Ceramic insert",
        "TP-01",
        12,
        "https://img.test/plate.png",
      ],
    );
    assert(Number(catItem.price) === 1250, `price ${catItem.price}`);
    assert(
      catItem.image_url === "https://img.test/plate.png",
      `image_url ${catItem.image_url}`,
    );
    await asRole(null);
    const inv = await one(
      `select count(*)::int n from inventory where item_id = $1`,
      [catItem.id],
    );
    assert(inv.n === 1, "inventory row not auto-created");
    const aud = await one(
      `select count(*)::int n from audit_logs where action='ITEM_CREATED' and entity_id=$1`,
      [catItem.id],
    );
    assert(aud.n === 1, "no ITEM_CREATED audit row");
    await asRole("authenticated", admin.id);
  },
);
await expect("admin updates an item; price change is audited", async () => {
  const updated = await one(
    `select * from update_item($1,'Trauma Plate','VEST','UNIT',$2,null,null,12,true,true)`,
    [catItem.id, 1400],
  );
  assert(Number(updated.price) === 1400, `price ${updated.price}`);
  await asRole(null);
  const aud = await one(
    `select old_values->>'price' o, new_values->>'price' n
       from audit_logs where action='ITEM_UPDATED' and entity_id=$1
       order by created_at desc limit 1`,
    [catItem.id],
  );
  assert(
    Number(aud.o) === 1250 && Number(aud.n) === 1400,
    `audit price delta wrong: ${aud.o} -> ${aud.n}`,
  );
  await asRole("authenticated", admin.id);
});
await expect(
  "archiving hides the item from members but keeps it orderable-safe",
  async () => {
    const archived = await one(`select * from archive_item($1)`, [catItem.id]);
    assert(archived.archived_at !== null, "archived_at not set");
    assert(
      archived.active === false && archived.orderable === false,
      "flags not cleared",
    );
    await asRole("authenticated", m1.id);
    const visible = await one(
      `select count(*)::int n from items where id = $1`,
      [catItem.id],
    );
    assert(visible.n === 0, "archived item still visible to member");
    await asRole("authenticated", admin.id);
  },
);
await expectThrows(
  "cannot edit an archived item",
  () =>
    db.query(
      `select update_item($1,'x','VEST','UNIT',1,null,null,0,true,true)`,
      [catItem.id],
    ),
  "Restore this item",
);
await expect("restore brings it back", async () => {
  const restored = await one(`select * from restore_item($1)`, [catItem.id]);
  assert(
    restored.archived_at === null && restored.active === true,
    "not restored",
  );
});

// ── organization settings ──────────────────────────────────────────────
console.log("\nSettings");
await asRole("authenticated", m1.id);
await expectThrows(
  "member cannot change org settings",
  () => db.query(`select update_organization_settings('Hacked', null)`),
  "Super Admin",
);
await asRole("authenticated", admin.id);
await expect("admin updates org settings (audited)", async () => {
  const row = await one(`select * from update_organization_settings($1, $2)`, [
    "Crimson Creed HQ",
    "https://example.test/logo.png",
  ]);
  assert(row.org_name === "Crimson Creed HQ", `name ${row.org_name}`);
  await asRole(null);
  const aud = await one(
    `select count(*)::int n from audit_logs where action = 'SETTINGS_UPDATED'`,
  );
  assert(aud.n === 1, `expected 1 settings audit row, got ${aud.n}`);
  await asRole("authenticated", admin.id);
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

// ── production & payroll ───────────────────────────────────────────────
console.log("\nProduction & payroll");
await asRole(null);
const weed = await one(
  `insert into items (name, category, unit, price) values ('Processed Weed','PRODUCT','GRAM',0) returning id`,
);

await asRole("authenticated", m1.id);
await expectThrows(
  "member cannot set a production rate",
  () => db.query(`select set_production_rate($1, 5)`, [weed.id]),
  "Super Admin",
);
await asRole("authenticated", admin.id);
await expectThrows(
  "rate rejected for a non-PRODUCT item",
  () => db.query(`select set_production_rate($1, 5)`, [item.id]),
  "PRODUCT",
);
await expect("admin sets a production pay rate", async () => {
  const r = await one(`select * from set_production_rate($1, $2)`, [
    weed.id,
    12.5,
  ]);
  assert(Number(r.unit_rate) === 12.5, `rate ${r.unit_rate}`);
});

await asRole("authenticated", m1.id);
await expectThrows(
  "log rejected when quantity <= 0",
  () => db.query(`select submit_production_log($1, 0, null, null)`, [weed.id]),
  "greater than zero",
);
let plog;
await expect(
  "member logs production; payout computed server-side from the rate",
  async () => {
    plog = await one(`select * from submit_production_log($1, $2, $3, $4)`, [
      weed.id,
      40,
      "2026-08-20T12:00:00Z",
      "night shift",
    ]);
    assert(plog.status === "PENDING", `status ${plog.status}`);
    assert(Number(plog.quantity) === 40, `qty ${plog.quantity}`);
    assert(
      Number(plog.unit_rate_snapshot) === 12.5,
      `rate snap ${plog.unit_rate_snapshot}`,
    );
    assert(
      Number(plog.payout_amount) === 500,
      `payout ${plog.payout_amount} (expected 40 * 12.5)`,
    );
    assert(
      plog.item_name_snapshot === "Processed Weed",
      "name not snapshotted",
    );
  },
);

// rate change must not rewrite an existing log
await asRole("authenticated", admin.id);
await db.query(`select set_production_rate($1, 99)`, [weed.id]);
await asRole(null);
await expect(
  "historical log payout unchanged after a rate change",
  async () => {
    const r = await one(
      `select unit_rate_snapshot, payout_amount from production_logs where id = $1`,
      [plog.id],
    );
    assert(
      Number(r.unit_rate_snapshot) === 12.5 && Number(r.payout_amount) === 500,
      `snapshot drifted: ${r.unit_rate_snapshot} / ${r.payout_amount}`,
    );
  },
);
await asRole("authenticated", admin.id);
await db.query(`select set_production_rate($1, 12.5)`, [weed.id]);

// a second member logs some production too
await asRole("authenticated", m2.id);
const plog2 = await one(
  `select * from submit_production_log($1, $2, $3, null)`,
  [weed.id, 10, "2026-08-21T09:00:00Z"],
);

// RLS: members only see their own logs
await expect("member_two cannot see member_one's production logs", async () => {
  const r = await one(
    `select count(*)::int n from production_logs where id = $1`,
    [plog.id],
  );
  assert(r.n === 0, `expected 0, got ${r.n}`);
});

await asRole("authenticated", m1.id);
await expectThrows(
  "member cannot review a production log",
  () => db.query(`select review_production_log($1, true, null)`, [plog.id]),
  "Super Admin",
);

await asRole("authenticated", admin.id);
await expectThrows(
  "rejecting a log requires a reason",
  () => db.query(`select review_production_log($1, false, null)`, [plog2.id]),
  "reason is required",
);
await expect("admin approves a production log (member notified)", async () => {
  const r = await one(`select * from review_production_log($1, true, $2)`, [
    plog.id,
    "verified on stream",
  ]);
  assert(r.status === "APPROVED", `status ${r.status}`);
  await asRole(null);
  const notif = await one(
    `select count(*)::int n from notifications where recipient_id = $1 and type = 'PRODUCTION_LOG_APPROVED'`,
    [memberId.m1],
  );
  assert(notif.n === 1, `expected 1 approval notification, got ${notif.n}`);
  await asRole("authenticated", admin.id);
});
await expect("admin approves the second log", async () => {
  const r = await one(`select * from review_production_log($1, true, null)`, [
    plog2.id,
  ]);
  assert(r.status === "APPROVED", `status ${r.status}`);
});
await expectThrows(
  "a reviewed log cannot be reviewed again",
  () => db.query(`select review_production_log($1, false, 'nope')`, [plog.id]),
  "already",
);

// a pending log that a member cancels
await asRole("authenticated", m1.id);
const plog3 = await one(
  `select * from submit_production_log($1, $2, $3, null)`,
  [weed.id, 5, "2026-08-22T09:00:00Z"],
);
await expect("member cancels their own pending log", async () => {
  const r = await one(`select * from cancel_production_log($1)`, [plog3.id]);
  assert(r.status === "CANCELLED", `status ${r.status}`);
});

// payroll run: finalize rolls approved in-range logs into per-member lines
await asRole("authenticated", m1.id);
await expectThrows(
  "member cannot open a payroll run",
  () => db.query(`select create_payroll_run('2026-08-01','2026-08-31',null)`),
  "Super Admin",
);
await asRole("authenticated", admin.id);
let run;
await expect("admin opens a draft payroll run", async () => {
  run = await one(
    `select * from create_payroll_run('2026-08-01','2026-08-31','August')`,
  );
  assert(run.status === "DRAFT", `status ${run.status}`);
  assert(/^PR-\d{6}$/.test(run.run_number), `run_number ${run.run_number}`);
});
await expect(
  "finalize rolls approved logs into member lines and totals server-side",
  async () => {
    const r = await one(`select * from finalize_payroll_run($1)`, [run.id]);
    assert(r.status === "FINALIZED", `status ${r.status}`);
    // m1: 40 * 12.5 = 500 ; m2: 10 * 12.5 = 125 ; total 625
    assert(Number(r.total_amount) === 625, `total ${r.total_amount}`);
    await asRole(null);
    const lines = await db.query(
      `select member_id, log_count, gross_amount from payroll_run_lines where payroll_run_id = $1 order by gross_amount desc`,
      [run.id],
    );
    assert(
      lines.rows.length === 2,
      `expected 2 lines, got ${lines.rows.length}`,
    );
    assert(
      Number(lines.rows[0].gross_amount) === 500 &&
        Number(lines.rows[1].gross_amount) === 125,
      `line amounts wrong: ${JSON.stringify(lines.rows)}`,
    );
    const stamped = await one(
      `select count(*)::int n from production_logs where payroll_run_id = $1`,
      [run.id],
    );
    assert(stamped.n === 2, `expected 2 stamped logs, got ${stamped.n}`);
    await asRole("authenticated", admin.id);
  },
);
await expectThrows(
  "a finalized run cannot be finalized again",
  () => db.query(`select finalize_payroll_run($1)`, [run.id]),
  "draft",
);

// member sees their own payroll line + gets paid
await asRole("authenticated", m1.id);
await expect("member sees their own payroll run + line", async () => {
  const runs = await one(`select count(*)::int n from payroll_runs`);
  assert(runs.n === 1, `expected 1 visible run, got ${runs.n}`);
  const line = await one(
    `select gross_amount from payroll_run_lines where payroll_run_id = $1`,
    [run.id],
  );
  assert(Number(line.gross_amount) === 500, `line ${line?.gross_amount}`);
});
await asRole("authenticated", m2.id);
await expect("member_two cannot see member_one's payroll line", async () => {
  const r = await one(
    `select count(*)::int n from payroll_run_lines where member_id = $1`,
    [memberId.m1],
  );
  assert(r.n === 0, `expected 0, got ${r.n}`);
});
await asRole("authenticated", admin.id);
await expect("admin marks the run paid (members notified)", async () => {
  const r = await one(`select * from mark_payroll_run_paid($1)`, [run.id]);
  assert(r.status === "PAID", `status ${r.status}`);
  await asRole(null);
  const notif = await one(
    `select count(*)::int n from notifications where type = 'PAYROLL_PAID'`,
  );
  assert(notif.n === 2, `expected 2 paid notifications, got ${notif.n}`);
  await asRole("authenticated", admin.id);
});
await expect("payroll_run_lines are immutable", async () => {
  await asRole(null);
  let blocked = false;
  try {
    await db.query(`update payroll_run_lines set gross_amount = 0`);
  } catch {
    blocked = true;
  }
  assert(blocked, "expected the append-only trigger to block the update");
});

// ── company cash (0024-0027) ─────────────────────────────────────────────
console.log("\nCompany cash");
await asRole("authenticated", m1.id);
await expectThrows(
  "member cannot record a cash entry",
  () =>
    db.query(
      `select record_cash_entry('IN', 500, 'SALES_REVENUE', null, null, false)`,
    ),
  "Super Admin",
);

await asRole("authenticated", admin.id);
await expect("balance starts at zero", async () => {
  const r = await one(`select balance from cash_account where id = true`);
  assert(Number(r.balance) === 0, `balance ${r.balance}`);
});

let cashIncome;
await expect(
  "admin records income; balance + snapshot move server-side",
  async () => {
    cashIncome = await one(
      `select * from record_cash_entry('IN', 500, 'SALES_REVENUE', null, 'first sale', false)`,
    );
    assert(cashIncome.direction === "IN", cashIncome.direction);
    assert(Number(cashIncome.amount) === 500, `amount ${cashIncome.amount}`);
    assert(
      Number(cashIncome.balance_after) === 500,
      `balance_after ${cashIncome.balance_after}`,
    );
    assert(cashIncome.source === "MANUAL", cashIncome.source);
    assert(/^CE-\d{6}$/.test(cashIncome.entry_number), cashIncome.entry_number);
    const acct = await one(`select balance from cash_account where id = true`);
    assert(Number(acct.balance) === 500, `account balance ${acct.balance}`);
  },
);

let cashExpense;
await expect("admin records an expense; balance decreases", async () => {
  cashExpense = await one(
    `select * from record_cash_entry('OUT', 200, 'PAYROLL', null, null, false)`,
  );
  assert(Number(cashExpense.balance_after) === 300, cashExpense.balance_after);
});

await expectThrows(
  "category must match the direction",
  () =>
    db.query(
      `select record_cash_entry('IN', 10, 'PAYROLL', null, null, false)`,
    ),
  "does not belong",
);
await expectThrows(
  "an expense beyond the balance is blocked",
  () =>
    db.query(
      `select record_cash_entry('OUT', 5000, 'OTHER_EXPENSE', null, null, false)`,
    ),
  "more than",
);
await expect("balance unchanged after the rejected writes", async () => {
  const r = await one(`select balance from cash_account where id = true`);
  assert(Number(r.balance) === 300, `balance ${r.balance}`);
});

await expect("p_allow_negative lets the balance go below zero", async () => {
  const e = await one(
    `select * from record_cash_entry('OUT', 800, 'OPERATING_EXPENSE', null, null, true)`,
  );
  assert(Number(e.balance_after) === -500, `balance_after ${e.balance_after}`);
});

let cashReversal;
await expect(
  "reversing an entry posts the opposite and restores the balance",
  async () => {
    cashReversal = await one(`select * from reverse_cash_entry($1, $2)`, [
      cashExpense.id,
      "logged twice",
    ]);
    assert(cashReversal.direction === "IN", cashReversal.direction);
    assert(Number(cashReversal.amount) === 200, cashReversal.amount);
    assert(cashReversal.source === "ADJUSTMENT", cashReversal.source);
    assert(
      cashReversal.reverses_entry_id === cashExpense.id,
      "reverses_entry_id not linked",
    );
    const r = await one(`select balance from cash_account where id = true`);
    assert(Number(r.balance) === -300, `balance ${r.balance}`);
  },
);
await expectThrows(
  "an entry cannot be reversed twice",
  () => db.query(`select reverse_cash_entry($1, 'again')`, [cashExpense.id]),
  "already been reversed",
);
await expectThrows(
  "a reversal entry cannot itself be reversed",
  () => db.query(`select reverse_cash_entry($1, 'no')`, [cashReversal.id]),
  "cannot itself be reversed",
);
await asRole("authenticated", m1.id);
await expect("member cannot see the cash ledger or balance", async () => {
  const e = await one(`select count(*)::int n from cash_entries`);
  const a = await one(`select count(*)::int n from cash_account`);
  assert(e.n === 0 && a.n === 0, `expected 0 visible rows, got ${e.n}/${a.n}`);
});
await asRole("authenticated", admin.id);
await expect("recording leaves an audit row", async () => {
  await asRole(null);
  const r = await one(
    `select count(*)::int n from audit_logs where action = 'CASH_ENTRY_RECORDED' and entity_id = $1`,
    [cashIncome.id],
  );
  assert(r.n === 1, `expected 1 audit row, got ${r.n}`);
});
await expect("cash_entries is append-only", async () => {
  let blocked = false;
  try {
    await db.query(`update cash_entries set amount = 0`);
  } catch {
    blocked = true;
  }
  assert(blocked, "expected the append-only trigger to block the update");
});

// ── auth throttle (0022) ──────────────────────────────────────────────────
await asRole(null);
await expect(
  "auth throttle blocks after the limit and clears on success",
  async () => {
    const k = "test:signin:198.51.100.7";
    for (let i = 1; i <= 3; i += 1) {
      const r = await one(`select hit_auth_throttle($1, 3, 900, 900) as wait`, [
        k,
      ]);
      assert(Number(r.wait) === 0, `attempt ${i} should pass, got ${r.wait}`);
    }
    const blocked = await one(
      `select hit_auth_throttle($1, 3, 900, 900) as wait`,
      [k],
    );
    assert(
      Number(blocked.wait) > 0,
      `4th attempt should be blocked, got ${blocked.wait}`,
    );
    await db.query(`select clear_auth_throttle($1)`, [k]);
    const after = await one(
      `select hit_auth_throttle($1, 3, 900, 900) as wait`,
      [k],
    );
    assert(
      Number(after.wait) === 0,
      `after clear should pass, got ${after.wait}`,
    );
  },
);
await expect("auth_throttle is not readable by authenticated", async () => {
  await asRole("authenticated", admin.id);
  let denied = false;
  try {
    await db.query(`select 1 from auth_throttle limit 1`);
  } catch {
    denied = true;
  }
  assert(denied, "authenticated must not read auth_throttle");
  await asRole(null);
});

printSummaryAndExit();

function printSummaryAndExit() {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
