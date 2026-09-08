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
  // 2 fixture items + 3 seeded by 0033 (Metal Scrap / Empty Bottle / Empty Can)
  const r = await one(`select count(*)::int n from inventory`);
  assert(r.n === 5, `expected 5 inventory rows, got ${r.n}`);
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

// ── stock types (company stash) ────────────────────────────────────────
let stashItem;
await expect(
  "non-catalogue item is forced non-orderable and priced 0",
  async () => {
    stashItem = await one(
      `select * from create_item($1,'TOOL','UNIT',$2,null,null,3,true,true,null,'TOOL')`,
      ["Thermite Charge", 500],
    );
    assert(
      stashItem.stock_type === "TOOL",
      `stock_type ${stashItem.stock_type}`,
    );
    assert(
      stashItem.orderable === false,
      "non-catalogue item stayed orderable",
    );
    assert(Number(stashItem.price) === 0, `price ${stashItem.price}`);
  },
);
await expect("members cannot see non-catalogue stock", async () => {
  await asRole("authenticated", m1.id);
  const seen = await one(`select count(*)::int n from items where id = $1`, [
    stashItem.id,
  ]);
  assert(seen.n === 0, "member can see a stash-only item");
  await asRole("authenticated", admin.id);
});
await expectThrows(
  "the orderable flag cannot be set on non-catalogue stock",
  () =>
    db.query(`update items set orderable = true where id = $1`, [stashItem.id]),
  "items_only_catalogue_orderable",
);
await expect(
  "0033 material items are reclassified as raw materials",
  async () => {
    const bad = await one(
      `select count(*)::int n from items i
       join submission_material_types s on s.inventory_item_id = i.id
      where i.stock_type <> 'RAW_MATERIAL'`,
    );
    assert(bad.n === 0, `${bad.n} material item(s) not RAW_MATERIAL`);
  },
);

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
await expectThrows(
  "member cannot store an over-long display_name (0046 guard)",
  () =>
    db.query(
      `update members set display_name = repeat('x', 200) where user_id = $1`,
      [m1.id],
    ),
  "members_display_name_max_len",
);

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
await expect(
  "create_production_product makes item + rate in one call (0048)",
  async () => {
    const r = await one(`select * from create_production_product($1, $2, $3)`, [
      "Cut Cocaine",
      "GRAM",
      8.25,
    ]);
    assert(Number(r.unit_rate) === 8.25, `rate ${r.unit_rate}`);
    await asRole(null);
    const it = await one(
      `select category, orderable, price from items where id = $1`,
      [r.item_id],
    );
    assert(
      it.category === "PRODUCT" &&
        it.orderable === false &&
        Number(it.price) === 0,
      `item shape wrong: ${JSON.stringify(it)}`,
    );
    await asRole("authenticated", admin.id);
  },
);
await expectThrows(
  "create_production_product rolls back the item when the rate is invalid",
  () =>
    db.query(`select create_production_product($1, $2, $3)`, [
      "Bad Batch",
      "GRAM",
      -1,
    ]),
  "zero or more",
);
await expect("…and left no orphan item behind", async () => {
  await asRole(null);
  const r = await one(
    `select count(*)::int n from items where name = 'Bad Batch'`,
  );
  assert(r.n === 0, `expected 0 orphan items, got ${r.n}`);
  await asRole("authenticated", admin.id);
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

await expect(
  "an entry can be attributed to a Super Admin (handled_by)",
  async () => {
    const e = await one(
      `select * from record_cash_entry('IN', 100, 'OTHER_INCOME', null, null, false, $1)`,
      [memberId.admin],
    );
    assert(e.handled_by === memberId.admin, `handled_by ${e.handled_by}`);
  },
);
await expectThrows(
  "handled_by cannot be a plain member",
  () =>
    db.query(
      `select record_cash_entry('IN', 100, 'OTHER_INCOME', null, null, false, $1)`,
      [memberId.m1],
    ),
  "only be attributed to a Super Admin",
);
await expect("a reversal carries the original's handler", async () => {
  const src = await one(
    `select * from record_cash_entry('OUT', 50, 'WITHDRAWAL', null, null, true, $1)`,
    [memberId.admin],
  );
  const rev = await one(`select * from reverse_cash_entry($1, 'test')`, [
    src.id,
  ]);
  assert(
    rev.handled_by === memberId.admin,
    `reversal handled_by ${rev.handled_by}`,
  );
});

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

// ── suppliers (0028-0031) ────────────────────────────────────────────────
console.log("\nSuppliers");
await asRole("authenticated", m1.id);
await expect("member cannot see suppliers or the price book", async () => {
  const s = await one(`select count(*)::int n from suppliers`);
  const si = await one(`select count(*)::int n from supplier_items`);
  assert(s.n === 0 && si.n === 0, `expected 0 visible, got ${s.n}/${si.n}`);
});
await expectThrows(
  "member cannot create a supplier",
  () => db.query(`select create_supplier('Hidden',null,null,true)`),
  "Super Admin",
);

await asRole("authenticated", admin.id);
let supplier;
await expect("admin creates a supplier (audit + activity)", async () => {
  supplier = await one(
    `select * from create_supplier('Peninsula Parts','ask for Rae','trusted',true)`,
  );
  assert(supplier.name === "Peninsula Parts", supplier.name);
  assert(supplier.active === true, "should be active");
  await asRole(null);
  const a = await one(
    `select count(*)::int n from audit_logs where action = 'SUPPLIER_CREATED' and entity_id = $1`,
    [supplier.id],
  );
  const act = await one(
    `select count(*)::int n from activity_logs where reference_type = 'SUPPLIER' and reference_id = $1`,
    [supplier.id],
  );
  assert(a.n === 1 && act.n === 1, `audit ${a.n}, activity ${act.n}`);
  await asRole("authenticated", admin.id);
});

await expect("admin renames a supplier", async () => {
  const updated = await one(
    `select * from update_supplier($1,'Peninsula Parts Co',null,null,true)`,
    [supplier.id],
  );
  assert(updated.name === "Peninsula Parts Co", updated.name);
});

await expect("archive then restore a supplier", async () => {
  const archived = await one(`select * from archive_supplier($1)`, [
    supplier.id,
  ]);
  assert(
    archived.archived_at !== null && archived.active === false,
    "archive should set archived_at and clear active",
  );
  const restored = await one(`select * from restore_supplier($1)`, [
    supplier.id,
  ]);
  assert(
    restored.archived_at === null && restored.active === true,
    "restore should clear archived_at and set active",
  );
});

let supItem;
await expect("set_supplier_item lists an item with buy/sell/max", async () => {
  supItem = await one(
    `select * from set_supplier_item($1,$2,6500,7000,25,true)`,
    [supplier.id, item.id],
  );
  assert(Number(supItem.buy_price) === 6500, supItem.buy_price);
  assert(Number(supItem.sell_price) === 7000, supItem.sell_price);
  assert(supItem.max_quantity === 25, supItem.max_quantity);
});
await expect(
  "set_supplier_item upserts the same pair (no duplicate)",
  async () => {
    const again = await one(
      `select * from set_supplier_item($1,$2,6000,null,null,false)`,
      [supplier.id, item.id],
    );
    assert(again.id === supItem.id, "should update the same row");
    assert(Number(again.buy_price) === 6000, again.buy_price);
    assert(again.sell_price === null, "sell_price should clear to null");
    await asRole(null);
    const c = await one(
      `select count(*)::int n from supplier_items where supplier_id = $1 and item_id = $2`,
      [supplier.id, item.id],
    );
    assert(c.n === 1, `expected 1 row, got ${c.n}`);
    await asRole("authenticated", admin.id);
  },
);
await expectThrows(
  "set_supplier_item rejects a negative buy price",
  () =>
    db.query(`select set_supplier_item($1,$2,-1,null,null,true)`, [
      supplier.id,
      item.id,
    ]),
  "zero or more",
);

await expect("a listed item cannot be hard-deleted (FK restrict)", async () => {
  await asRole(null);
  let blocked = false;
  try {
    await db.query(`delete from items where id = $1`, [item.id]);
  } catch {
    blocked = true;
  }
  assert(blocked, "expected the supplier_items FK to block the delete");
  await asRole("authenticated", admin.id);
});

await expect("remove_supplier_item drops the line", async () => {
  await db.query(`select remove_supplier_item($1)`, [supItem.id]);
  await asRole(null);
  const c = await one(
    `select count(*)::int n from supplier_items where id = $1`,
    [supItem.id],
  );
  assert(c.n === 0, `expected 0 rows, got ${c.n}`);
  await asRole("authenticated", admin.id);
});

// ── relations (0042-0044, 0051) ─────────────────────────────────────────
console.log("\nRelations");
await asRole(null);
const msItemId = (
  await one(
    `select inventory_item_id id from submission_material_types where code = 'MS'`,
  )
).id;
await expect("0051 switched Metal Scrap from kg to pcs (UNIT)", async () => {
  const it = await one(`select unit from items where id = $1`, [msItemId]);
  const mt = await one(
    `select unit from submission_material_types where code = 'MS'`,
  );
  assert(
    it.unit === "UNIT" && mt.unit === "UNIT",
    `item ${it.unit}, material_type ${mt.unit}`,
  );
});
const msQtyBefore = Number(
  (
    await one(
      `select coalesce(current_quantity, 0) q from inventory where item_id = $1`,
      [msItemId],
    )
  ).q,
);
await asRole("authenticated", m1.id);
await expect("member cannot see relations", async () => {
  const r = await one(`select count(*)::int n from relations`);
  assert(r.n === 0, `expected 0 visible, got ${r.n}`);
});
await expectThrows(
  "member cannot create a relation",
  () => db.query(`select create_relation('Hidden', current_date, null)`),
  "Super Admin",
);

await asRole("authenticated", admin.id);
let relation;
await expect("admin creates a relation (audit + activity)", async () => {
  relation = await one(
    `select * from create_relation('Harbour contact', date '2026-01-05', 'docks crew intro', $1, true, date '2026-03-01', true)`,
    [memberId.m1],
  );
  assert(relation.name === "Harbour contact", relation.name);
  const joined = new Date(relation.joined_on).toISOString().slice(0, 10);
  assert(joined === "2026-01-05", joined);
  assert(
    relation.handler_member_id === memberId.m1,
    relation.handler_member_id,
  );
  assert(relation.metal_scrap_settled === true, "metal_scrap_settled");
  const oath = new Date(relation.oath_date).toISOString().slice(0, 10);
  assert(oath === "2026-03-01", oath);
  assert(relation.blood_oath === true, "blood_oath");
  await asRole(null);
  const a = await one(
    `select count(*)::int n from audit_logs where action = 'RELATION_CREATED' and entity_id = $1`,
    [relation.id],
  );
  const act = await one(
    `select count(*)::int n from activity_logs where verb = 'relation.created' and reference_id = $1`,
    [relation.id],
  );
  assert(a.n === 1 && act.n === 1, `audit ${a.n}, activity ${act.n}`);
  await asRole("authenticated", admin.id);
});

await expect(
  "creating a settled relation posts +250 Metal Scrap to the stash",
  async () => {
    await asRole(null);
    const q = Number(
      (
        await one(
          `select current_quantity q from inventory where item_id = $1`,
          [msItemId],
        )
      ).q,
    );
    assert(
      q === msQtyBefore + 250,
      `metal scrap ${q}, expected ${msQtyBefore + 250}`,
    );
    const mv = await one(
      `select count(*)::int n from inventory_movements
       where reference_type = 'RELATION'
         and reference_id = $1 and quantity = 250`,
      [relation.id],
    );
    assert(mv.n === 1, `expected 1 +250 movement, got ${mv.n}`);
    await asRole("authenticated", admin.id);
  },
);

await expect("admin updates a relation (clears optional fields)", async () => {
  const updated = await one(
    `select * from update_relation($1, 'Harbour contact — Nils', date '2026-02-01', null)`,
    [relation.id],
  );
  assert(updated.name === "Harbour contact — Nils", updated.name);
  const joined = new Date(updated.joined_on).toISOString().slice(0, 10);
  assert(joined === "2026-02-01", joined);
  assert(updated.notes === null, "notes should clear to null");
  assert(updated.handler_member_id === null, "handler should clear to null");
  assert(updated.metal_scrap_settled === false, "metal_scrap_settled clears");
  assert(updated.oath_date === null, "oath_date should clear to null");
  assert(updated.blood_oath === false, "blood_oath clears");
});

await expect(
  "reopening the prerequisite reverses the 250 in the stash",
  async () => {
    await asRole(null);
    const q = Number(
      (
        await one(
          `select current_quantity q from inventory where item_id = $1`,
          [msItemId],
        )
      ).q,
    );
    assert(q === msQtyBefore, `metal scrap back to ${msQtyBefore}, got ${q}`);
    const rev = await one(
      `select count(*)::int n from inventory_movements
       where reference_type = 'RELATION' and reference_id = $1 and quantity = -250`,
      [relation.id],
    );
    assert(rev.n === 1, `expected 1 reversal movement, got ${rev.n}`);
    await asRole("authenticated", admin.id);
  },
);

await expect("re-settling posts +250 again", async () => {
  await one(
    `select * from update_relation($1, 'Harbour contact — Nils', date '2026-02-01', null, null, true, null, false)`,
    [relation.id],
  );
  await asRole(null);
  const q = Number(
    (
      await one(`select current_quantity q from inventory where item_id = $1`, [
        msItemId,
      ])
    ).q,
  );
  assert(q === msQtyBefore + 250, `metal scrap ${q}`);
  await asRole("authenticated", admin.id);
});

await expect(
  "updating a settled relation without touching the flag posts nothing",
  async () => {
    await asRole(null);
    const before = (
      await one(
        `select count(*)::int n from inventory_movements where reference_type = 'RELATION' and reference_id = $1`,
        [relation.id],
      )
    ).n;
    await asRole("authenticated", admin.id);
    await one(
      `select * from update_relation($1, 'Harbour contact — Nils 2', date '2026-02-01', 'note', null, true, null, false)`,
      [relation.id],
    );
    await asRole(null);
    const after = (
      await one(
        `select count(*)::int n from inventory_movements where reference_type = 'RELATION' and reference_id = $1`,
        [relation.id],
      )
    ).n;
    assert(after === before, `movements changed ${before} -> ${after}`);
    await asRole("authenticated", admin.id);
  },
);

await expectThrows(
  "create_relation rejects a blank name",
  () => db.query(`select create_relation('   ', current_date, null)`),
  "required",
);

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

// ── monthly material submissions (0028–0031) ─────────────────────────────
console.log("\nMonthly material submissions");
await asRole(null);
const mt = {};
for (const row of (
  await db.query(
    `select code, id, inventory_item_id from submission_material_types`,
  )
).rows) {
  mt[row.code] = row;
}
await expect("0033 seeded 3 material types mapped to items", async () => {
  assert(mt.MS && mt.EB && mt.EC, "MS/EB/EC material types missing");
  assert(
    mt.MS.inventory_item_id &&
      mt.EB.inventory_item_id &&
      mt.EC.inventory_item_id,
    "material types not mapped to inventory items",
  );
});

const subLines = (ms, eb, ec) =>
  JSON.stringify([
    { material_type_id: mt.MS.id, quantity: ms },
    { material_type_id: mt.EB.id, quantity: eb },
    { material_type_id: mt.EC.id, quantity: ec },
  ]);

await asRole("authenticated", m1.id);
let submission;
await expectThrows(
  "submit requires a receiver (PIC)",
  () =>
    db.query(`select submit_material_submission($1::jsonb, null, null, null)`, [
      subLines(1, 0, 0),
    ]),
  "received your submission",
);
await expectThrows(
  "submit rejects a receiver who is not a Super Admin",
  () =>
    db.query(
      `select submit_material_submission($1::jsonb, null, null, $2::uuid)`,
      [subLines(1, 0, 0), memberId.m1],
    ),
  "cannot receive submissions",
);
await expect("member submits materials for the current month", async () => {
  submission = await one(
    `select * from submit_material_submission($1::jsonb, $2, null, $3::uuid)`,
    [subLines(400, 1000, 1000), "May haul", memberId.admin],
  );
  assert(submission.status === "PENDING", `status ${submission.status}`);
  assert(
    submission.received_by === memberId.admin,
    `received_by ${submission.received_by}`,
  );
  assert(
    submission.received_by_name === "Admin Boss",
    `received_by_name ${submission.received_by_name}`,
  );
  const lines = await db.query(
    `select name_snapshot, unit_snapshot, quantity from member_submission_lines
     where member_submission_id = $1 order by name_snapshot`,
    [submission.id],
  );
  assert(lines.rows.length === 3, `expected 3 lines, got ${lines.rows.length}`);
  const scrap = lines.rows.find((r) => r.name_snapshot === "Metal Scrap");
  assert(
    scrap && Number(scrap.quantity) === 400 && scrap.unit_snapshot === "UNIT", // 0051 moved Metal Scrap from kg to pcs
    "metal scrap line not snapshotted correctly",
  );
});
await expect("submit lazily created the month period", async () => {
  const r = await one(
    `select count(*)::int n from submission_periods
     where period_month = date_trunc('month', current_date)::date`,
  );
  assert(r.n === 1, `expected 1 period row, got ${r.n}`);
});
await expect("re-submitting overwrites the pending lines", async () => {
  const again = await one(
    `select * from submit_material_submission($1::jsonb, null, null, $2::uuid)`,
    [subLines(420, 1000, 1000), memberId.admin],
  );
  assert(again.id === submission.id, "resubmit created a second row");
  const scrap = await one(
    `select quantity from member_submission_lines
     where member_submission_id = $1 and material_type_id = $2`,
    [submission.id, mt.MS.id],
  );
  assert(Number(scrap.quantity) === 420, `expected 420, got ${scrap.quantity}`);
});
await expectThrows(
  "submit rejects an unknown material id",
  () =>
    db.query(
      `select submit_material_submission($1::jsonb, null, null, $2::uuid)`,
      [
        JSON.stringify([{ material_type_id: admin.id, quantity: 5 }]),
        memberId.admin,
      ],
    ),
  "not being collected",
);
await expect(
  "member can list Super Admins as submission receivers",
  async () => {
    const rows = (await db.query(`select * from list_submission_receivers()`))
      .rows;
    assert(rows.length === 1, `expected 1 receiver, got ${rows.length}`);
    assert(
      rows[0].id === memberId.admin && rows[0].display_name === "Admin Boss",
      "receiver list did not return the Super Admin",
    );
  },
);

await asRole("authenticated", m2.id);
await expect("member_two cannot see member_one's submission", async () => {
  const r = await one(`select count(*)::int n from member_submissions`);
  assert(r.n === 0, `expected 0 visible, got ${r.n}`);
});
await expectThrows(
  "member cannot confirm a submission",
  () =>
    db.query(`select confirm_member_submission($1, null, null)`, [
      submission.id,
    ]),
  "Super Admin",
);

const scrapItem = mt.MS.inventory_item_id;
const invQty = async (itemId) =>
  Number(
    (
      await one(
        `select coalesce(current_quantity,0) q from inventory where item_id=$1`,
        [itemId],
      )
    ).q,
  );

await asRole("authenticated", admin.id);
let scrapBefore;
await expect("admin confirms — stock posted for each material", async () => {
  scrapBefore = await invQty(scrapItem);
  const confirmed = await one(
    `select * from confirm_member_submission($1, null, $2, $3::uuid)`,
    [submission.id, "counted", memberId.admin],
  );
  assert(confirmed.status === "CONFIRMED", `status ${confirmed.status}`);
  assert(
    confirmed.received_by === memberId.admin &&
      confirmed.received_by_name === "Admin Boss",
    `receiver not carried onto confirm: ${confirmed.received_by_name}`,
  );
  assert(
    (await invQty(scrapItem)) === scrapBefore + 420,
    "metal scrap stock not posted",
  );
  const mv = await one(
    `select count(*)::int n from inventory_movements
     where reference_type = 'SUBMISSION' and reference_id = $1`,
    [submission.id],
  );
  assert(mv.n === 3, `expected 3 submission movements, got ${mv.n}`);
});
await expect("re-confirm with an adjustment posts only the delta", async () => {
  const before = await invQty(scrapItem);
  await db.query(`select confirm_member_submission($1, $2::jsonb, null)`, [
    submission.id,
    subLines(400, 1000, 1000),
  ]);
  assert(
    (await invQty(scrapItem)) === before - 20,
    `expected delta -20, stock went ${before} -> ${await invQty(scrapItem)}`,
  );
});
await expect("member cannot submit once the month is confirmed", async () => {
  await asRole("authenticated", m1.id);
  let blocked = false;
  try {
    await db.query(
      `select submit_material_submission($1::jsonb, null, null, $2::uuid)`,
      [subLines(1, 1, 1), memberId.admin],
    );
  } catch {
    blocked = true;
  }
  assert(blocked, "expected a confirmed month to block resubmission");
  await asRole("authenticated", admin.id);
});
await expect(
  "rejecting a confirmed submission reverses its stock",
  async () => {
    const before = await invQty(scrapItem);
    const rejected = await one(
      `select * from reject_member_submission($1, $2)`,
      [submission.id, "miscounted, resubmit"],
    );
    assert(rejected.status === "REJECTED", `status ${rejected.status}`);
    assert(
      (await invQty(scrapItem)) === before - 400,
      "rejected stock not reversed",
    );
  },
);
await expect("member can resubmit after a rejection", async () => {
  await asRole("authenticated", m1.id);
  const r = await one(
    `select * from submit_material_submission($1::jsonb, null, null, $2::uuid)`,
    [subLines(250, 0, 0), memberId.admin],
  );
  assert(r.status === "PENDING", `status ${r.status}`);
  await asRole("authenticated", admin.id);
});
await expect("admin sets monthly targets", async () => {
  const period = await one(
    `select * from set_submission_targets($1, $2::jsonb)`,
    [
      new Date().toISOString().slice(0, 7) + "-01",
      JSON.stringify([
        { material_type_id: mt.MS.id, target_quantity: 250 },
        { material_type_id: mt.EB.id, target_quantity: 1000 },
      ]),
    ],
  );
  const t = await one(
    `select target_quantity from submission_period_targets
     where period_id = $1 and material_type_id = $2`,
    [period.id, mt.MS.id],
  );
  assert(Number(t.target_quantity) === 250, `target ${t.target_quantity}`);
});
await asRole("authenticated", m1.id);
await expectThrows(
  "member cannot set targets",
  () =>
    db.query(`select set_submission_targets($1, '[]'::jsonb)`, [
      new Date().toISOString().slice(0, 7) + "-01",
    ]),
  "Super Admin",
);
await asRole("authenticated", admin.id);
await asRole(null);
await expect("super admins were notified of the submission", async () => {
  const r = await one(
    `select count(*)::int n from notifications
     where recipient_id = $1 and type = 'SUBMISSION_SUBMITTED'`,
    [memberId.admin],
  );
  assert(r.n >= 1, `expected >=1 admin notification, got ${r.n}`);
});
await expect("member was notified on confirm and reject", async () => {
  const r = await one(
    `select count(*)::int n from notifications
     where recipient_id = $1 and type in ('SUBMISSION_CONFIRMED','SUBMISSION_REJECTED')`,
    [memberId.m1],
  );
  assert(r.n === 2, `expected 2 member notifications, got ${r.n}`);
});
await asRole("authenticated", m1.id);
await expect("member cannot write member_submissions directly", async () => {
  let denied = false;
  try {
    await db.query(
      `insert into member_submissions (period_id, member_id) values (gen_random_uuid(), $1)`,
      [memberId.m1],
    );
  } catch {
    denied = true;
  }
  assert(denied, "member must not INSERT into member_submissions");
});
await asRole(null);

// ── submission order gate (0045) ────────────────────────────────────────
console.log("\nSubmission order gate");
await asRole(null);

// give member_one some history, then lock the gate to the previous month
await db.query(
  `update members
   set created_at = date_trunc('month', current_date) - interval '6 months'
   where id = $1`,
  [memberId.m1],
);
const gateStart = (
  await one(
    `select to_char(date_trunc('month', current_date) - interval '1 month', 'YYYY-MM-DD') d`,
  )
).d;
const beforeStart = (
  await one(
    `select to_char(date_trunc('month', current_date) - interval '3 months', 'YYYY-MM-DD') d`,
  )
).d;
const nextMonth = (
  await one(
    `select to_char(date_trunc('month', current_date) + interval '1 month', 'YYYY-MM-DD') d`,
  )
).d;
const gateOrder = JSON.stringify([{ item_id: item.id, quantity: 1 }]);

await asRole("authenticated", m1.id);
await expectThrows(
  "member cannot flip the order gate",
  () => db.query(`select set_submission_gate(true, $1::date)`, [gateStart]),
  "Super Admin",
);

await asRole("authenticated", admin.id);
await expectThrows(
  "enabling the gate needs a start month",
  () => db.query(`select set_submission_gate(true, null)`),
  "start from",
);
await expectThrows(
  "the gate cannot start in the future",
  () => db.query(`select set_submission_gate(true, $1::date)`, [nextMonth]),
  "future",
);
await expect("admin enables the gate from last month", async () => {
  const s = await one(`select * from set_submission_gate(true, $1::date)`, [
    gateStart,
  ]);
  assert(s.submission_gate_enabled === true, "gate not enabled");
  const start = (
    await one(
      `select to_char(submission_obligation_start_month, 'YYYY-MM-DD') d
       from organization_settings where id = true`,
    )
  ).d;
  assert(start === gateStart, `start month ${start}`);
});

await asRole("authenticated", m1.id);
await expect("member_one owes exactly the previous month", async () => {
  const r = await db.query(
    `select to_char(my_submission_debt(), 'YYYY-MM-DD') as m`,
  );
  assert(r.rows.length === 1, `expected 1 owed month, got ${r.rows.length}`);
  assert(r.rows[0].m === gateStart, `owed ${r.rows[0].m}`);
});
await expectThrows(
  "create_order is blocked while a submission month is owed",
  () => db.query(`select create_order($1::jsonb, null)`, [gateOrder]),
  "monthly materials",
);

let lateSub;
await expect("member hands in the owed month (stays PENDING)", async () => {
  lateSub = await one(
    `select * from submit_material_submission($1::jsonb, $2, $3::date, $4::uuid)`,
    [subLines(10, 0, 0), "late", gateStart, memberId.admin],
  );
  assert(lateSub.status === "PENDING", `status ${lateSub.status}`);
});
await expectThrows(
  "still blocked — the owed month is only PENDING",
  () => db.query(`select create_order($1::jsonb, null)`, [gateOrder]),
  "monthly materials",
);
await expectThrows(
  "cannot hand in for a month before the start month",
  () =>
    db.query(
      `select submit_material_submission($1::jsonb, null, $2::date, $3::uuid)`,
      [subLines(1, 0, 0), beforeStart, memberId.admin],
    ),
  "nothing outstanding",
);
await expectThrows(
  "cannot hand in for a future month",
  () =>
    db.query(
      `select submit_material_submission($1::jsonb, null, $2::date, $3::uuid)`,
      [subLines(1, 0, 0), nextMonth, memberId.admin],
    ),
  "has not started",
);

await asRole("authenticated", admin.id);
await expect("confirming the owed month clears the debt", async () => {
  await db.query(`select confirm_member_submission($1, null, null)`, [
    lateSub.id,
  ]);
  await asRole("authenticated", m1.id);
  const r = await db.query(`select my_submission_debt() as m`);
  assert(r.rows.length === 0, `expected 0 owed months, got ${r.rows.length}`);
});
await expect("ordering works once every owed month is confirmed", async () => {
  const o = await one(`select * from create_order($1::jsonb, null)`, [
    gateOrder,
  ]);
  assert(o.id, "order was not created");
});

await asRole("authenticated", admin.id);
await expect("admin can switch the gate back off", async () => {
  const s = await one(`select * from set_submission_gate(false, null)`);
  assert(s.submission_gate_enabled === false, "gate still on");
});

// ── member_dashboard() single-round-trip RPC (0050) ────────────────────────
console.log("\nMember dashboard RPC");
await asRole("authenticated", m1.id);
const asObj = (v) => (typeof v === "string" ? JSON.parse(v) : v);
await expect(
  "member_dashboard() returns the whole payload in one call",
  async () => {
    const r = await one(`select member_dashboard() as d`);
    const d = asObj(r.d);
    assert(typeof d.open === "number" && d.open >= 1, `open ${d.open}`);
    assert(
      typeof d.completed === "number" && d.completed >= 1,
      `completed ${d.completed}`,
    );
    assert(typeof d.completed7d === "number", `completed7d ${d.completed7d}`);
    assert(typeof d.unread === "number", `unread ${d.unread}`);
    // plog (40 * 12.5 = 500) was approved and locked into a paid run.
    assert(
      Number(d.earnings.paidAmount) === 500,
      `earnings.paidAmount ${JSON.stringify(d.earnings)}`,
    );
    assert(
      typeof d.submissionState === "string",
      `submissionState ${d.submissionState}`,
    );
    assert(
      /^\d{4}-\d{2}-01$/.test(d.periodMonth),
      `periodMonth ${d.periodMonth}`,
    );
    assert(
      Array.isArray(d.recentOrders) && d.recentOrders.length >= 1,
      `recentOrders ${JSON.stringify(d.recentOrders)?.slice(0, 80)}`,
    );
    assert(Array.isArray(d.activeOrders), "activeOrders not an array");
    assert(
      Array.isArray(d.recentNotifications),
      "recentNotifications not an array",
    );
    assert(Array.isArray(d.submissionDebt), "submissionDebt not an array");
    // order rows come through as full records
    assert(
      d.recentOrders[0].order_number?.startsWith("CC-"),
      "order row not a full record",
    );
  },
);
await asRole("authenticated", m2.id);
await expect("member_dashboard() is scoped to the caller", async () => {
  const d = asObj((await one(`select member_dashboard() as d`)).d);
  // m2 never completed an order; its one approved log (10 * 12.5) is in the
  // finalized run, so it counts as paid — and m1's 500 must not leak in.
  assert(d.completed === 0, `m2 completed ${d.completed}`);
  assert(
    Number(d.earnings.paidAmount) === 125,
    `m2 paid ${d.earnings.paidAmount}`,
  );
});
await asRole("authenticated", inactive.id);
await expectThrows(
  "member_dashboard() rejects a non-active member",
  () => db.query(`select member_dashboard()`),
  "active members",
);
await asRole(null);

printSummaryAndExit();

function printSummaryAndExit() {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
