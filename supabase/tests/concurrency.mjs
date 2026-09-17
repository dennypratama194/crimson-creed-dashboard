/**
 * Concurrency regression suite: the production assignment board (0074), item
 * deletion (0076), auth throttle bucket creation (0078) and member mutation
 * quotas (0079).
 *
 * WHY THIS IS A SEPARATE FILE FROM schema.mjs
 * -------------------------------------------
 * schema.mjs runs on PGlite, which is one in-process Postgres backend. Every
 * query in it shares a single connection, so two "concurrent" statements there
 * are just two sequential statements — `Promise.all` included. A row lock can
 * never be contended, an interleaving can never be forced, and a test written
 * that way proves nothing about the bug 0074 fixes. So this suite needs REAL
 * connections, and therefore a real Postgres.
 *
 * RUNNING IT
 * ----------
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/crimson_test \
 *     npm run db:test:concurrency
 *
 * The database is DROPPED AND REBUILT from supabase/migrations on every run, so
 * point it at a throwaway. It refuses to start against anything that looks like
 * a hosted Supabase project (see assertLocalTarget below) — production has no
 * business here. Without TEST_DATABASE_URL the suite exits 0 and says it
 * skipped, so `npm run validate` and CI stay green on a machine with no
 * Postgres. A skip is NOT a pass; the report has to say so.
 *
 * WHAT IT PROVES
 * --------------
 * Each case opens its own client, and the interleaving is forced by hand:
 * A begins and takes its lock, B begins and blocks on the same lock, A commits,
 * B is released. Before 0074 the payment path never took the parent lock, so B
 * never blocked, and the two transactions computed the rollup from snapshots
 * that could not see each other.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "migrations");

const URL = process.env.TEST_DATABASE_URL;
if (!URL) {
  console.log(
    "\nSKIPPED — concurrency tests need an isolated Postgres.\n" +
      "  Set TEST_DATABASE_URL to a throwaway database and re-run:\n" +
      "    TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/crimson_test \\\n" +
      "      npm run db:test:concurrency\n" +
      "  This is a SKIP, not a pass. The locking behaviour in migration 0074 is\n" +
      "  unverified until this suite actually runs.\n",
  );
  process.exit(0);
}

/**
 * Refuse anything that is not obviously a scratch database. A hosted Supabase
 * connection string carries the project host; a production accident here would
 * rewrite assignment state and drop the whole schema.
 */
function assertLocalTarget(url) {
  const u = new URL_(url);
  const host = u.hostname.toLowerCase();
  const name = u.pathname.replace(/^\//, "").toLowerCase();
  const localish =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "host.docker.internal" ||
    host.endsWith(".local");
  if (!localish) {
    throw new Error(
      `TEST_DATABASE_URL points at "${host}", which is not a local host. ` +
        `This suite drops and rebuilds the schema — point it at a throwaway.`,
    );
  }
  if (!/test|scratch|tmp|ci/.test(name)) {
    throw new Error(
      `TEST_DATABASE_URL database is "${name}". Name it something with ` +
        `"test" in it, so a rebuild can never be aimed at real data by mistake.`,
    );
  }
}
const URL_ = globalThis.URL;
assertLocalTarget(URL);

let pass = 0;
let fail = 0;
const failures = [];
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function expect(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    fail += 1;
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n      ${err?.message ?? err}`);
  }
}

// ── connection helpers ─────────────────────────────────────────────────────
async function connect() {
  const c = new Client({ connectionString: URL });
  await c.connect();
  return c;
}
/** Runs as a signed-in member: sets the JWT claim the auth helpers read. */
async function actAs(client, memberUserId) {
  await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
    memberUserId,
  ]);
}
/** Resolves once `client` is blocked waiting on a lock, or throws on timeout. */
async function waitUntilBlocked(probe, pid, ms = 5000) {
  const deadline = Date.now() + ms;
  for (;;) {
    const r = await probe.query(
      `select count(*)::int n from pg_stat_activity
       where pid = $1 and wait_event_type = 'Lock'`,
      [pid],
    );
    if (r.rows[0].n > 0) return;
    if (Date.now() > deadline) {
      throw new Error(`pid ${pid} never blocked on a lock`);
    }
    await new Promise((r2) => setTimeout(r2, 25));
  }
}
const pidOf = async (client) =>
  (await client.query(`select pg_backend_pid() pid`)).rows[0].pid;

// ── build the schema ───────────────────────────────────────────────────────
const setup = await connect();
console.log(`\nRebuilding schema in ${new URL_(URL).pathname.slice(1)}`);
await setup.query(`drop schema if exists public cascade`);
await setup.query(`drop schema if exists app cascade`);
await setup.query(`drop schema if exists auth cascade`);
await setup.query(`drop schema if exists storage cascade`);
await setup.query(`create schema public`);
await setup.query(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls; end if;
  end $$;
  grant anon, authenticated, service_role to current_user;

  -- A recreated public schema loses the default USAGE grant Supabase gives the
  -- API roles. Without it, authenticated cannot resolve a single RPC, and every
  -- member-side case fails with "function ... does not exist". Granted here,
  -- after the roles exist: a fresh CI Postgres has none until the block above.
  grant usage on schema public to anon, authenticated, service_role;

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

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id), name text
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
`);

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const file of files) {
  try {
    await setup.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  } catch (err) {
    console.log(`\nMigration ${file} failed: ${err.message}\n`);
    process.exit(1);
  }
}
console.log(`  ✓ ${files.length} migrations applied`);

// ── fixture ────────────────────────────────────────────────────────────────
const mk = async (name, role) => {
  const u = (
    await setup.query(
      `insert into auth.users (email) values ($1) returning id`,
      [`${name}@test.local`],
    )
  ).rows[0];
  const m = (
    await setup.query(
      `insert into members (user_id, username, display_name, rank, role, status)
       values ($1, $2, $3, 'SOLDIER', $4, 'ACTIVE') returning *`,
      [u.id, name, name, role],
    )
  ).rows[0];
  return { ...m, userId: u.id };
};
const admin = await mk("boss", "SUPER_ADMIN");
const admin2 = await mk("underboss", "SUPER_ADMIN");
const m1 = await mk("crew_one", "MEMBER");
const m2 = await mk("crew_two", "MEMBER");
const m3 = await mk("crew_three", "MEMBER");

const product = (
  await setup.query(
    `insert into items (name, category, unit, price, stock_type, orderable, active)
     values ('Concurrency Widget', 'PRODUCT', 'UNIT', 0, 'RAW_MATERIAL', false, true)
     returning *`,
  )
).rows[0];

/** A fresh three-person job, every line UNPAID. */
async function newJob() {
  await actAs(setup, admin.user_id);
  const job = (
    await setup.query(
      `select * from create_production_assignment($1::uuid[], $2, 10)`,
      [[m1.id, m2.id, m3.id], product.id],
    )
  ).rows[0];
  const lines = (
    await setup.query(
      `select id, member_id from production_assignment_members
       where assignment_id = $1 order by member_id`,
      [job.id],
    )
  ).rows;
  return { job, lines };
}
const statusOf = async (id) =>
  (
    await setup.query(
      `select status from production_assignments where id = $1`,
      [id],
    )
  ).rows[0].status;

console.log("\nCrew payment concurrency (0074)");

// ── 1. two different crew members paid at the same time ────────────────────
await expect(
  "two crew members paid concurrently still roll the job up correctly",
  async () => {
    const { job, lines } = await newJob();
    const a = await connect();
    const b = await connect();
    const probe = await connect();
    try {
      await actAs(a, admin.user_id);
      await actAs(b, admin2.user_id);

      await a.query("begin");
      await b.query("begin");

      // A takes the parent lock and holds it.
      const aDone = a.query(`select set_assignment_member_paid($1, true)`, [
        lines[0].id,
      ]);
      await aDone;

      // B goes for a DIFFERENT crew line on the SAME job. Before 0074 this
      // sailed straight past; now it must block on the parent.
      const bPid = await pidOf(b);
      const bDone = b.query(`select set_assignment_member_paid($1, true)`, [
        lines[1].id,
      ]);
      await waitUntilBlocked(probe, bPid);

      await a.query("commit");
      await bDone;
      await b.query("commit");

      // Third line still unpaid, so the job is UNPAID — but both lines are paid.
      const paid = (
        await setup.query(
          `select count(*)::int n from production_assignment_members
           where assignment_id = $1 and status = 'PAID'`,
          [job.id],
        )
      ).rows[0].n;
      assert(paid === 2, `${paid} line(s) paid, expected 2`);
      assert(
        (await statusOf(job.id)) === "UNPAID",
        "job rolled up PAID with a line still unpaid",
      );

      // Now the last one: the rollup has to notice.
      await setup.query(`select set_assignment_member_paid($1, true)`, [
        lines[2].id,
      ]);
      assert(
        (await statusOf(job.id)) === "PAID",
        "job did not roll up to PAID once every line was paid — this is the 0067 bug",
      );
    } finally {
      await Promise.all([a.end(), b.end(), probe.end()]);
    }
  },
);

// ── 2. the last two lines paid concurrently ────────────────────────────────
await expect(
  "the final rollup is PAID even when the last two lines race",
  async () => {
    const { job, lines } = await newJob();
    await setup.query(`select set_assignment_member_paid($1, true)`, [
      lines[0].id,
    ]);

    const a = await connect();
    const b = await connect();
    const probe = await connect();
    try {
      await actAs(a, admin.user_id);
      await actAs(b, admin2.user_id);
      await a.query("begin");
      await b.query("begin");

      await a.query(`select set_assignment_member_paid($1, true)`, [
        lines[1].id,
      ]);
      const bPid = await pidOf(b);
      const bDone = b.query(`select set_assignment_member_paid($1, true)`, [
        lines[2].id,
      ]);
      await waitUntilBlocked(probe, bPid);
      await a.query("commit");
      await bDone;
      await b.query("commit");

      assert(
        (await statusOf(job.id)) === "PAID",
        `every line is paid but the job reads ${await statusOf(job.id)}`,
      );
    } finally {
      await Promise.all([a.end(), b.end(), probe.end()]);
    }
  },
);

// ── 3. payment racing with cancellation ────────────────────────────────────
await expect("a cancel in flight beats a payment to the same job", async () => {
  const { job, lines } = await newJob();
  const a = await connect();
  const b = await connect();
  const probe = await connect();
  try {
    await actAs(a, admin.user_id);
    await actAs(b, admin2.user_id);
    await a.query("begin");
    await b.query("begin");

    // A cancels and holds the parent lock.
    await a.query(`select cancel_production_assignment($1, 'called off')`, [
      job.id,
    ]);

    // B tries to pay somebody on it and must wait for the cancel.
    const bPid = await pidOf(b);
    const bDone = b
      .query(`select set_assignment_member_paid($1, true)`, [lines[0].id])
      .then(
        () => ({ ok: true }),
        (err) => ({ ok: false, err }),
      );
    await waitUntilBlocked(probe, bPid);

    await a.query("commit");
    const result = await bDone;
    await b.query("rollback");

    assert(!result.ok, "a cancelled job was marked paid");
    assert(
      /cancelled/i.test(result.err.message),
      `wrong refusal: ${result.err.message}`,
    );
    assert(
      (await statusOf(job.id)) === "CANCELLED",
      "the payment overwrote CANCELLED — this is the 0067 rollup race",
    );
  } finally {
    await Promise.all([a.end(), b.end(), probe.end()]);
  }
});

await expect(
  "a payment in flight makes the cancel wait, then wins",
  async () => {
    const { job, lines } = await newJob();
    const a = await connect();
    const b = await connect();
    const probe = await connect();
    try {
      await actAs(a, admin.user_id);
      await actAs(b, admin2.user_id);
      await a.query("begin");
      await b.query("begin");

      await a.query(`select set_assignment_member_paid($1, true)`, [
        lines[0].id,
      ]);

      const bPid = await pidOf(b);
      const bDone = b.query(
        `select cancel_production_assignment($1, 'called off')`,
        [job.id],
      );
      await waitUntilBlocked(probe, bPid);

      await a.query("commit");
      await bDone;
      await b.query("commit");

      assert(
        (await statusOf(job.id)) === "CANCELLED",
        "the rollup wrote over the cancel after it committed",
      );
      // The line the payment wrote stays as it was — CANCELLED is the job's.
      const line = (
        await setup.query(
          `select status from production_assignment_members where id = $1`,
          [lines[0].id],
        )
      ).rows[0];
      assert(line.status === "PAID", `line status ${line.status}`);
    } finally {
      await Promise.all([a.end(), b.end(), probe.end()]);
    }
  },
);

// ── 4. whole-crew payment racing a single-person payment ───────────────────
await expect(
  "a whole-crew flip and a single-person flip serialize",
  async () => {
    const { job, lines } = await newJob();
    const a = await connect();
    const b = await connect();
    const probe = await connect();
    try {
      await actAs(a, admin.user_id);
      await actAs(b, admin2.user_id);
      await a.query("begin");
      await b.query("begin");

      // A marks the whole crew paid, holding the parent.
      await a.query(`select set_production_assignment_paid($1, true)`, [
        job.id,
      ]);

      // B un-pays one person on the same job — must queue behind A.
      const bPid = await pidOf(b);
      const bDone = b.query(`select set_assignment_member_paid($1, false)`, [
        lines[0].id,
      ]);
      await waitUntilBlocked(probe, bPid);

      await a.query("commit");
      await bDone;
      await b.query("commit");

      // B's un-pay landed last, so exactly one line is unpaid and the rollup
      // agrees. The point is that the two cannot disagree.
      const counts = (
        await setup.query(
          `select count(*) filter (where status = 'PAID')::int paid,
                  count(*)::int total
           from production_assignment_members where assignment_id = $1`,
          [job.id],
        )
      ).rows[0];
      assert(counts.paid === counts.total - 1, `${counts.paid} paid`);
      assert(
        (await statusOf(job.id)) === "UNPAID",
        "rollup says PAID with a line unpaid",
      );
    } finally {
      await Promise.all([a.end(), b.end(), probe.end()]);
    }
  },
);

// ── 5. two whole-crew flips at once do not deadlock ────────────────────────
await expect("two whole-crew flips queue rather than deadlock", async () => {
  const { job } = await newJob();
  const a = await connect();
  const b = await connect();
  try {
    await actAs(a, admin.user_id);
    await actAs(b, admin2.user_id);
    // No hand-forced interleaving here: fired at once on two connections, the
    // consistent parent-then-children-by-id order is what keeps them off each
    // other's toes.
    const [ra, rb] = await Promise.allSettled([
      a.query(`select set_production_assignment_paid($1, true)`, [job.id]),
      b.query(`select set_production_assignment_paid($1, true)`, [job.id]),
    ]);
    for (const r of [ra, rb]) {
      if (r.status === "rejected") {
        assert(
          !/deadlock/i.test(r.reason.message),
          `deadlock detected: ${r.reason.message}`,
        );
        throw r.reason;
      }
    }
    assert((await statusOf(job.id)) === "PAID", "job did not roll up to PAID");
  } finally {
    await Promise.all([a.end(), b.end()]);
  }
});

// ── 6. a repeated request changes nothing ──────────────────────────────────
await expect("a retried same-state payment is a true no-op", async () => {
  const { job, lines } = await newJob();
  await setup.query(`select set_assignment_member_paid($1, true)`, [
    lines[0].id,
  ]);
  const before = (
    await setup.query(
      `select paid_at, paid_by,
              (select count(*)::int from audit_logs
                where action = 'PRODUCTION_ASSIGNMENT_PAID' and entity_id = $1) audits,
              (select count(*)::int from notifications
                where type = 'PRODUCTION_ASSIGNMENT_PAID' and reference_id = $2) notes
       from production_assignment_members where id = $1`,
      [lines[0].id, job.id],
    )
  ).rows[0];

  // Fire the same request twice more, concurrently — the double-click.
  const a = await connect();
  const b = await connect();
  try {
    await actAs(a, admin.user_id);
    await actAs(b, admin2.user_id);
    await Promise.all([
      a.query(`select set_assignment_member_paid($1, true)`, [lines[0].id]),
      b.query(`select set_assignment_member_paid($1, true)`, [lines[0].id]),
    ]);
  } finally {
    await Promise.all([a.end(), b.end()]);
  }

  const after = (
    await setup.query(
      `select paid_at, paid_by,
              (select count(*)::int from audit_logs
                where action = 'PRODUCTION_ASSIGNMENT_PAID' and entity_id = $1) audits,
              (select count(*)::int from notifications
                where type = 'PRODUCTION_ASSIGNMENT_PAID' and reference_id = $2) notes
       from production_assignment_members where id = $1`,
      [lines[0].id, job.id],
    )
  ).rows[0];

  assert(
    String(before.paid_at) === String(after.paid_at),
    `paid_at was rewritten: ${before.paid_at} -> ${after.paid_at}`,
  );
  assert(
    String(before.paid_by) === String(after.paid_by),
    "paid_by attribution was reassigned by a repeat",
  );
  assert(
    before.audits === after.audits,
    `audit rows ${before.audits} -> ${after.audits}`,
  );
  assert(
    before.notes === after.notes,
    `notifications ${before.notes} -> ${after.notes}`,
  );
});

// ── 7. a failure rolls the whole thing back ────────────────────────────────
await expect("a failed payment leaves no trace", async () => {
  const { job, lines } = await newJob();
  const a = await connect();
  try {
    await actAs(a, admin.user_id);
    await a.query("begin");
    await a.query(`select set_assignment_member_paid($1, true)`, [lines[0].id]);
    // Force a failure after the write, in the same transaction.
    await a
      .query(`select set_assignment_member_paid($1, true)`, [
        "00000000-0000-0000-0000-000000000000",
      ])
      .then(
        () => {
          throw new Error("an unknown line id was accepted");
        },
        () => undefined,
      );
    await a.query("rollback");
  } finally {
    await a.end();
  }
  const paid = (
    await setup.query(
      `select count(*)::int n from production_assignment_members
       where assignment_id = $1 and status = 'PAID'`,
      [job.id],
    )
  ).rows[0].n;
  assert(paid === 0, `${paid} line(s) survived a rolled-back transaction`);
  assert((await statusOf(job.id)) === "UNPAID", "rollup survived the rollback");
});

// ── 8. authorization is not weakened by any of this ────────────────────────
await expect("a member cannot pay, whole-crew or single", async () => {
  const { job, lines } = await newJob();
  const c = await connect();
  try {
    await c.query(`set role authenticated`);
    await actAs(c, m1.user_id);
    for (const [sql, params] of [
      [`select set_assignment_member_paid($1, true)`, [lines[0].id]],
      [`select set_production_assignment_paid($1, true)`, [job.id]],
      [`select cancel_production_assignment($1)`, [job.id]],
    ]) {
      let err = null;
      try {
        await c.query(sql, params);
      } catch (e) {
        err = e;
      }
      assert(err !== null, `a member ran: ${sql}`);
      assert(/Super Admin/i.test(err.message), `wrong refusal: ${err.message}`);
    }
  } finally {
    await c.end();
  }
});

await expect("an inactive Super Admin is refused too", async () => {
  const { lines } = await newJob();
  await setup.query(`update members set status = 'INACTIVE' where id = $1`, [
    admin2.id,
  ]);
  const c = await connect();
  try {
    await c.query(`set role authenticated`);
    await actAs(c, admin2.user_id);
    let err = null;
    try {
      await c.query(`select set_assignment_member_paid($1, true)`, [
        lines[0].id,
      ]);
    } catch (e) {
      err = e;
    }
    assert(err !== null, "an inactive Super Admin marked a line paid");
  } finally {
    await c.end();
    await setup.query(`update members set status = 'ACTIVE' where id = $1`, [
      admin2.id,
    ]);
  }
});

// ── 9. item deletion racing a new reference (0076) ─────────────────────────
console.log("\nItem delete concurrency (0076)");
await expect("an order placed mid-delete blocks the delete", async () => {
  const fresh = (
    await setup.query(
      `insert into items (name, category, unit, price, stock_type, orderable, active)
       values ('Race Item', 'PRODUCT', 'UNIT', 100, 'CATALOGUE', true, true)
       returning *`,
    )
  ).rows[0];

  const a = await connect(); // the member ordering
  const b = await connect(); // the admin deleting
  const probe = await connect();
  try {
    await a.query(`set role authenticated`);
    await actAs(a, m1.user_id);
    await actAs(b, admin.user_id);

    await a.query("begin");
    await a.query(
      `select create_order(jsonb_build_array(
         jsonb_build_object('item_id', $1::text, 'quantity', 1)))`,
      [fresh.id],
    );

    // The order's FK takes a KEY SHARE lock on the item row; delete_item wants
    // FOR UPDATE on the same row, so it has to wait rather than count zero.
    const bPid = await pidOf(b);
    const bDone = b.query(`select delete_item($1)`, [fresh.id]).then(
      () => ({ ok: true }),
      (err) => ({ ok: false, err }),
    );
    await waitUntilBlocked(probe, bPid);

    await a.query("commit");
    const result = await bDone;

    assert(!result.ok, "the item was deleted out from under a live order");
    assert(
      /order line/i.test(result.err.message),
      `wrong refusal: ${result.err.message}`,
    );
    const still = (
      await setup.query(`select count(*)::int n from items where id = $1`, [
        fresh.id,
      ])
    ).rows[0].n;
    assert(still === 1, "the item vanished despite the refusal");
  } finally {
    await Promise.all([a.end(), b.end(), probe.end()]);
  }
});

// ── 10. auth throttle bucket creation (0078) ───────────────────────────────
console.log("\nAuth throttle concurrency (0078)");
const svc = async () => {
  const c = await connect();
  await c.query(`set role service_role`);
  return c;
};
const hitOn = (c, key, limit = 5, win = 60, block = 60) =>
  c
    .query(`select hit_auth_throttle($1, $2, $3, $4) w`, [
      key,
      limit,
      win,
      block,
    ])
    .then((r) => Number(r.rows[0].w));
const attemptsOf = async (key) =>
  (
    await setup.query(`select attempts from auth_throttle where key = $1`, [
      key,
    ])
  ).rows[0]?.attempts ?? null;

await expect(
  "a first hit that waits on another first hit is counted, not an error",
  async () => {
    const key = "conc:first-hit:forced";
    const a = await svc();
    const b = await svc();
    const probe = await connect();
    try {
      await a.query("begin");
      assert((await hitOn(a, key)) === 0, "A refused");
      // B's insert conflicts with A's uncommitted row and must WAIT on it —
      // under 0047 it found no row, inserted, and died on the primary key.
      const bPid = await pidOf(b);
      const bDone = hitOn(b, key).then(
        (w) => ({ ok: true, w }),
        (err) => ({ ok: false, err }),
      );
      await waitUntilBlocked(probe, bPid);
      await a.query("commit");
      const r = await bDone;
      assert(r.ok, `B failed instead of counting: ${r.err?.message}`);
      assert(r.w === 0, `B wait ${r.w}`);
      assert(
        (await attemptsOf(key)) === 2,
        `attempts ${await attemptsOf(key)}`,
      );
    } finally {
      await Promise.all([a.end(), b.end(), probe.end()]);
    }
  },
);

await expect(
  "a parallel burst of first hits allows exactly the limit",
  async () => {
    const key = "conc:first-hit:burst";
    const clients = await Promise.all(Array.from({ length: 25 }, () => svc()));
    try {
      const results = await Promise.all(
        clients.map((c) =>
          hitOn(c, key, 5, 60, 60).then(
            (w) => ({ ok: true, w }),
            (err) => ({ ok: false, err }),
          ),
        ),
      );
      const errors = results.filter((r) => !r.ok);
      assert(
        errors.length === 0,
        `${errors.length} errors: ${errors[0]?.err?.message}`,
      );
      const allowed = results.filter((r) => r.w === 0).length;
      assert(allowed === 5, `allowed ${allowed} of 25 (limit 5)`);
      // 5 allowed + the one that tripped the block; blocked hits do not count
      assert(
        (await attemptsOf(key)) === 6,
        `attempts ${await attemptsOf(key)}`,
      );
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  },
);

await expect("different keys do not wait on each other", async () => {
  const a = await svc();
  const b = await svc();
  try {
    await a.query("begin");
    await hitOn(a, "conc:keys:one");
    // A holds key one's row lock until commit. Key two must not queue behind it.
    await b.query(`set statement_timeout = '2s'`);
    const w = await hitOn(b, "conc:keys:two");
    assert(w === 0, `key two wait ${w}`);
    await a.query("commit");
  } finally {
    await Promise.all([a.end(), b.end()]);
  }
});

/** A seed after which the next random() is below the 1% sweep threshold. */
async function sweepSeed(c) {
  for (let i = 0; i < 20000; i += 1) {
    const seed = (i / 20000) * 2 - 1;
    await c.query(`select setseed($1)`, [seed]);
    const r = (await c.query(`select random() r`)).rows[0].r;
    if (r < 0.01) return seed;
  }
  throw new Error("no seed triggers the sweep");
}

await expect(
  "the sweep skips a bucket another hit holds, and loses no update",
  async () => {
    const held = "conc:sweep:held";
    const idle = "conc:sweep:idle";
    await setup.query(
      `insert into auth_throttle (key, attempts, first_attempt_at)
       values ($1, 3, now() - interval '3 hours'), ($2, 3, now() - interval '3 hours')`,
      [held, idle],
    );
    const a = await svc();
    const b = await svc();
    try {
      // A resets the stale `held` bucket and keeps it locked.
      await a.query("begin");
      assert((await hitOn(a, held)) === 0, "A refused");

      // B sweeps. It must skip `held` (locked) rather than wait on it, and
      // delete `idle`, which nobody holds.
      await b.query(`set statement_timeout = '2s'`);
      await b.query(`select setseed($1)`, [await sweepSeed(b)]);
      assert((await hitOn(b, "conc:sweep:sweeper")) === 0, "sweeper refused");

      await a.query("commit");
      assert(
        (await attemptsOf(held)) === 1,
        `held bucket lost A's reset: ${await attemptsOf(held)}`,
      );
      assert((await attemptsOf(idle)) === null, "idle stale bucket not swept");
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  },
);

await expect(
  "a hit on a bucket being swept re-creates it instead of failing",
  async () => {
    const key = "conc:sweep:recreate";
    await setup.query(
      `insert into auth_throttle (key, attempts, first_attempt_at)
       values ($1, 4, now() - interval '3 hours')`,
      [key],
    );
    // table owner: stands in for the sweep inside hit_auth_throttle
    const sweeper = await connect();
    const hitter = await svc();
    const probe = await connect();
    try {
      // Stand in for a sweep: lock the stale row and delete it, uncommitted.
      await sweeper.query("begin");
      await sweeper.query(`delete from auth_throttle where key = $1`, [key]);
      const pid = await pidOf(hitter);
      const done = hitOn(hitter, key, 5).then(
        (w) => ({ ok: true, w }),
        (err) => ({ ok: false, err }),
      );
      await waitUntilBlocked(probe, pid);
      await sweeper.query("commit");
      const r = await done;
      assert(r.ok, `hit failed: ${r.err?.message}`);
      assert(r.w === 0, `wait ${r.w}`);
      assert(
        (await attemptsOf(key)) === 1,
        `attempts ${await attemptsOf(key)}`,
      );
    } finally {
      await Promise.all([sweeper.end(), hitter.end(), probe.end()]);
    }
  },
);

// ── 11. member mutation quotas under concurrency (0079) ───────────────────
console.log("\nMember quota concurrency (0079)");
const quotaItem = (
  await setup.query(
    `insert into items (name, category, unit, price, stock_type, orderable, active)
     values ('Quota Item', 'AMMO', 'ROUND', 1, 'CATALOGUE', true, true)
     returning *`,
  )
).rows[0];
const quotaLine = JSON.stringify([{ item_id: quotaItem.id, quantity: 1 }]);
const asMember = async (member) => {
  const c = await connect();
  await c.query(`set role authenticated`);
  await actAs(c, member.user_id);
  return c;
};
const setHits = (member, hits) =>
  setup.query(
    `insert into member_action_throttle (member_id, action, window_started_at, hits)
     values ($1, 'order:create', clock_timestamp(), $2)
     on conflict (member_id, action) do update
       set window_started_at = excluded.window_started_at, hits = excluded.hits`,
    [member.id, hits],
  );
const ordersOf = async (member) =>
  (
    await setup.query(
      `select count(*)::int n from orders where member_id = $1`,
      [member.id],
    )
  ).rows[0].n;

await expect(
  "the last slot goes to one call; the queued one is refused on commit",
  async () => {
    await setHits(m1, 14);
    const a = await asMember(m1);
    const b = await asMember(m1);
    const probe = await connect();
    try {
      await a.query("begin");
      await a.query(`select create_order($1::jsonb, null)`, [quotaLine]);
      const bPid = await pidOf(b);
      const bDone = b
        .query(`select create_order($1::jsonb, null)`, [quotaLine])
        .then(
          () => ({ ok: true }),
          (err) => ({ ok: false, err }),
        );
      await waitUntilBlocked(probe, bPid);
      await a.query("commit");
      const r = await bDone;
      assert(!r.ok, "both calls took the last slot");
      assert(r.err.code === "CC429", `code ${r.err.code}: ${r.err.message}`);
    } finally {
      await Promise.all([a.end(), b.end(), probe.end()]);
    }
  },
);

await expect(
  "a rolled-back call releases its slot to the call queued behind it",
  async () => {
    await setHits(m2, 14);
    const a = await asMember(m2);
    const b = await asMember(m2);
    const probe = await connect();
    try {
      await a.query("begin");
      await a.query(`select create_order($1::jsonb, null)`, [quotaLine]);
      const bPid = await pidOf(b);
      const bDone = b
        .query(`select create_order($1::jsonb, null)`, [quotaLine])
        .then(
          () => ({ ok: true }),
          (err) => ({ ok: false, err }),
        );
      await waitUntilBlocked(probe, bPid);
      await a.query("rollback");
      const r = await bDone;
      assert(r.ok, `B refused after A rolled back: ${r.err?.message}`);
    } finally {
      await Promise.all([a.end(), b.end(), probe.end()]);
    }
  },
);

await expect(
  "a parallel burst from one member creates exactly 15 orders",
  async () => {
    await setup.query(
      `delete from member_action_throttle where member_id = $1`,
      [m3.id],
    );
    const before = await ordersOf(m3);
    const clients = await Promise.all(
      Array.from({ length: 22 }, () => asMember(m3)),
    );
    try {
      const results = await Promise.all(
        clients.map((c) =>
          c.query(`select create_order($1::jsonb, null)`, [quotaLine]).then(
            () => ({ ok: true }),
            (err) => ({ ok: false, err }),
          ),
        ),
      );
      const ok = results.filter((r) => r.ok).length;
      const other = results.filter((r) => !r.ok && r.err.code !== "CC429");
      assert(other.length === 0, `unexpected: ${other[0]?.err?.message}`);
      assert(ok === 15, `${ok} orders succeeded (limit 15)`);
      assert((await ordersOf(m3)) - before === 15, "order count disagrees");
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  },
);

await expect("one member's burst does not spend another's quota", async () => {
  await setup.query(`delete from member_action_throttle where member_id = $1`, [
    m1.id,
  ]);
  const c = await asMember(m1);
  try {
    await c.query(`select create_order($1::jsonb, null)`, [quotaLine]);
  } finally {
    await c.end();
  }
});

// ── summary ────────────────────────────────────────────────────────────────
await setup.end();
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ✗ ${f.name}\n      ${f.err.stack}`);
}
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
