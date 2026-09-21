# Engineering standards

The rules this codebase is actually held to. `AGENTS.md` is the short version
every contributor and agent reads first; this is where each rule is explained
and justified. `CLAUDE.md` carries the product's domain non-negotiables and
points here for process.

These are specific to Crimson Creed. A generic checklist would be ignored, so
everything below exists because of something in this repository: a bug that
shipped, a rule the PRD makes non-negotiable, or a shape the schema enforces.

---

## A. Business invariants

**The database is the enforcement point. The UI hides controls; that is not a
security boundary.** Every authorization, eligibility and ownership rule has to
hold when someone calls the RPC directly with a REST client.

- Two app roles: `SUPER_ADMIN` and `MEMBER`. Rank is metadata and never grants
  anything.
- Admin RPCs call `app.require_super_admin()` as their first statement. The
  schema suite asserts this: any `SECURITY DEFINER` function in `public` that is
  not on the `MEMBER_CALLABLE` allowlist must refuse a member with
  `insufficient_privilege`, so forgetting the gate fails CI.
- "My" RPCs scope themselves through `app.current_member_id()` and take **no
  member id parameter**. A Super Admin's RLS view is the whole organisation, so
  a member id passed in from a page would silently widen the result. See
  `my_distribution_summary()`, `my_submission_debt()`,
  `my_production_assignments()`.
- Money is computed server-side and snapshotted. Order totals, `line_total`,
  `amount_owed` (`quantity × unit_rate_snapshot`), item name, unit and price all
  come from the RPC. Nothing about money is trusted from the browser.
- A snapshot is permanent. Changing a catalogue price or a company cut must not
  rewrite an order or a draw that already happened.
- Inventory changes are movements. Never write `inventory.current_quantity`
  directly; post an `inventory_movements` row and let the trigger apply it.
  `inventory_movements` is append-only.
- Multi-table writes go through one RPC and are atomic. A refusal must leave
  nothing behind — no half-written order, no assignment without its crew.

### Current feature behaviour that is deliberate

Do not "fix" these without agreeing it first:

- **Neither a settled draw nor a paid production assignment posts to company
  cash.** Both statuses are records of what happened, not treasury movements.
- **Production is an assignment board**, not piece-rate work. One
  `production_assignments` row holds a crew of `production_assignment_members`
  lines, each with its own `UNPAID / PAID` flag. The job's `status` is a rollup:
  `PAID` only when every line is paid, `CANCELLED` terminal and never
  recomputed.
- **A member on a job sees only their own crew line** — never a crewmate's name
  or pay state.
- **Eligibility for a company cut and for a production assignment is by
  `items.category = 'PRODUCT'`**, not by stock type.

### The two documented exceptions

1. **`delete_item` really deletes.** It is the owner-approved exception to "no
   hard deletes of anything referenced historically" (see `CLAUDE.md`), and the
   only path allowed to delete `inventory_movements` — admitted by
   `app.reject_movement_mutation()` only while the transaction-local
   `app.purging_item` GUC names that exact item. It still refuses permanently
   for order lines, draws in **any** status, and submission materials, because
   those are money and seeded config. Archive is the path for those.

   Be honest about recovery: the audit row records **that** history was
   destroyed and **how much**. Counts are not a backup. Undoing a mistaken
   delete means restoring the database.

2. **The piece-rate/payroll module is dormant, not dead code.**
   `production_rates`, `production_logs`, `payroll_runs`, `payroll_run_lines`
   and their RPCs still exist and still carry their RLS; nothing reads or
   writes them. Do not build on them, do not drop them, and do not let a
   dead-code scanner delete their types or contracts.

---

## B. Database changes

**Migrations are forward-only.** A file that has merged describes what the
deployed database actually did. `supabase db push` will not re-run it, so
editing it makes the repo lie about production. `npm run check:migrations`
enforces this in CI against the PR's own merge-base — it never hard-codes a
number, and it does not stop you editing a migration you added in the same
branch.

- Number a new migration after the current highest. Do not fill a numbering gap:
  a gap means something was dropped before merging, and a database already past
  that number will never run a file you slot in behind it. The check warns when
  you do.
- Prefer additive and backward-compatible. The currently deployed app keeps
  running against the new schema for the length of a deploy, so a migration
  must not break the version that is still live.
- Preserve RPC signatures and return shapes. `create or replace` keeps grants;
  changing the argument list creates a _second_ overload and callers resolve
  ambiguously. If the signature must change, drop the old form explicitly in
  the same migration.
- New RPC: `revoke all ... from public, anon` then
  `grant execute ... to authenticated, service_role`, and re-state grants at the
  bottom of the file so a clean install lands identically.
- **Pin `search_path` on every function in `public` and `app`**, not only the
  `SECURITY DEFINER` ones. `set search_path = public, pg_temp` in the
  declaration, or `alter function ... set search_path` when only the setting is
  missing. A trigger function is easy to forget —
  `app.reject_movement_mutation()` shipped without it in 0073 and was fixed in 0076.
- The schema suite must pass **both** ways: clean install (every migration in
  order from nothing) and upgrade (the new migrations on top of the previous
  schema). Idempotency checks re-apply migrations in a **throwaway** database —
  never into the live test database, where replaying an old file would roll a
  redefined function back and every assertion after it would be testing the
  wrong thing.
- Backfills run against realistic existing data, not an empty table.
- Review the lock a migration takes and how long it holds it. `create index` on
  a large table blocks writes; `create index concurrently` cannot run inside a
  migration transaction.

---

## C. Concurrency

**Document the lock order for anything with shared state, and always take the
parent first.**

The rule in this codebase is **parent, then child, children in `id` order**:

1. resolve the parent id,
2. `select ... from <parent> where id = ... for update`,
3. re-read and re-validate the child under that lock,
4. write, and recompute any rollup while still holding it.

`set_assignment_member_paid` in 0067 locked the crew line but read the job
unlocked. Two admins paying two different people on one job could not see each
other's uncommitted rows, so both computed the rollup as `UNPAID` and it stayed
that way for ever, with every line paid. The same gap let a payment's rollup
overwrite a `CANCELLED` job. Migration 0074 is the fix and the worked example.

- **Consider the repeat.** A retried or double-clicked request for a state the
  row is already in must change nothing: no rewritten attribution or timestamp,
  no second audit row, no second notification. Compare _before_ writing.
- **Concurrency tests need independent connections.** `npm run db:test` runs on
  PGlite, which is one in-process backend — every query shares a connection, so
  `Promise.all` there is just sequential execution and proves nothing about
  locking. Real interleaving lives in `npm run db:test:concurrency`, which
  needs an isolated Postgres via `TEST_DATABASE_URL` and refuses any host that
  is not local. A skipped run is a skip, never a pass; say so in the PR.

---

## D. Performance

- **Bound anything that grows.** The member assignment list used to fetch every
  crew line the member owned, map it to ids and ask for `id in (<the whole
list>)`. Past PostgREST's row cap (1000 on Supabase) the list came back
  truncated with no error: jobs vanished and the total under-counted to match.
  Filter, order, page and count in SQL.
- The same cap applies to hydration. A bounded page of parents can still ask
  for an unbounded number of children — 20 jobs × 50 crew is exactly 1000. Chunk
  the request (`CREW_CHUNK` in `src/lib/db/production.ts`) or return the child
  inside the page's own RPC.
- **Aggregate in SQL** when the rows themselves are not needed. The dashboards
  are one round-trip each (`admin_dashboard()`, `member_dashboard()`) and the
  callers only derive deltas. Adding a query to a dashboard means editing that
  RPC, not adding a second fetch.
- **Deterministic pagination.** Order by the sort column _and_ a unique
  tie-breaker. `assigned_at` is not unique — rows written by one statement share
  it — so `order by assigned_at desc, id desc`. Without the tie-breaker, paging
  repeats and skips rows.
- **Validate and clamp page inputs** in the RPC. `least(greatest(limit, 1), 100)`,
  offset floored at zero. On the PostgREST side, `pageBounds()` /
  `clampPage()` in `src/lib/db/paging.ts` turn a `?page=` from the URL into a
  whole page number before it becomes a range.
- **"Read everything" is a bounded loop, not one select.** Pickers and
  catalogues that genuinely need the whole set use `readAllRows()` (batches
  below the row cap, unique order, loud failure past a ceiling); id lists go
  through `chunk()`. Totals and counts belong in SQL instead.
- **A failed read is not absence.** Readers throw on a Supabase error; `null`
  means the row does not exist (or RLS hides it), and a malformed id from the
  URL is `null` before any query (`isUuid`). Never `data ?? 0` over an ignored
  `error` — an outage then renders as a zero balance or a 404.
- **Justify an index with the query it serves.** Name the query shape in the
  migration comment. Do not add indexes speculatively — each one is paid for on
  every write.
- Do not claim a performance win from a query count alone. One query that reads
  50,000 rows is not an improvement on three that read 60.
- `select("*")` is fine when the contract is the whole row, and the row types
  come from it. Narrow the column list when the contract is genuinely narrower
  (a picker, a count, a name lookup). There is no blanket ban.

### Caching and revalidation

Cache Components is **off** (`next.config.ts`), so this is the previous model:
routes are dynamic, and the only persistent cache is one `unstable_cache`.

- **The one persistent cache is the orderable catalogue**
  (`getOrderableItems`, tag `ORDERABLE_ITEMS_CACHE_TAG`, 5-minute backstop). It
  is global on purpose: every active member sees the same rows, and it reads
  with the service role behind the exact filter RLS would apply. Every item
  write (`create_item`, `update_item`, `archive_item`, `restore_item`,
  `delete_item`) goes through `revalidateItemViews()` in
  `admin/items/actions.ts`; `admin/items/actions.test.ts` pins that. A new path
  that mutates `items` must do the same.
- **What must never be cached across requests:** anything a checkout, payment,
  stock, cash or authorization decision reads. The catalogue may show a stale
  price; `create_order` prices from the database regardless.
- **Within one request, dedupe with `React.cache`.** `getUser`,
  `getCurrentMember` and `getUnreadNotificationCount` are memoized so the layout
  and the page share one lookup. Do not build a cross-request cache for these.
  `getUser` reads `getClaims()` (local JWT verification, no Auth round trip), so
  a session revoked elsewhere lives until its access token expires; the live
  `members` row check is what actually gates access. It needs asymmetric JWT
  signing keys.
- **A Server Action that calls `revalidatePath` must not be followed by
  `router.refresh()`.** Next renders the affected page inside the action's own
  response (`skipPageRendering` is false once a path was revalidated), so the
  extra `refresh()` is a second full render — layout auth, unread count and
  every page query again. Revalidate the page being viewed in the action and
  leave the client alone. `router.refresh()` is only right when no action
  revalidated the view.
- **Log retention is a database rule, not a cache.** `activity_logs` keeps 90
  days and `audit_logs` 365 (`app.log_retention()`, migration 0081). Both stay
  append-only; rows leave only through `app.purge_expired_logs()`, which the
  insert triggers run on ~2% of statements, a bounded batch at a time. A purge
  is permanent — recovery is a database restore.
- **Independent reads go in one `Promise.all`.** A child read that needs only an
  id (`getOrderDetail`'s lines and timeline) does not wait for its parent row.

---

## E. Application structure

- **Reads** live in `src/lib/db/*` and are `import "server-only"`.
- **Mutations** go through a Server Action in the route folder, which calls
  `requireSuperAdmin()` / `requireActiveMember()`, parses input with a Zod
  schema from `src/lib/validation/*`, calls one RPC, and revalidates.
  Authorization is re-checked in the RPC regardless.
- **Errors** reach the user through `rpcErrorMessage()` — non-technical, never a
  raw Postgres message.
- **Domain strings** come from `src/lib/constants/`. Never inline an enum value
  or a category string in a component.
- **Styling** consumes semantic tokens (`bg-background`, `text-muted-foreground`,
  `--tone-*`). Never a raw palette hex.
- **Generated types stay separate from hand-authored contracts.**
  `src/lib/database.types.ts` is generated output — `npm run db:types` replaces
  it whole. jsonb RPC payload shapes and their Zod schemas live in
  `src/lib/db/contracts.ts`, which no generator touches.
- **jsonb crosses into the app at one typed boundary.** `returns jsonb` is
  opaque to Postgres and to the type generator; a TypeScript type over it is a
  claim nobody checks. Call `parseRpcPayload(schema, data, "rpc_name")` once,
  where the data arrives, instead of casting at every use. Validate the shape
  the app branches on; do not re-validate every column of every table row inside
  it — that breaks the moment a migration adds a column.
- **Abstractions earn their place.** Add one when duplication is demonstrated,
  not anticipated.

---

## F. Finishing a feature

Before calling it done:

- **Update the workflow tests you changed.** A UI change that makes a field
  required breaks the E2E spec that skipped it — the acceptance spec confirmed
  "I've paid" without choosing a recipient long after the picker became
  mandatory. Fix the test to match the UI; never weaken the assertion to make it
  pass, and never use a fixed sleep.
- **Walk every state**: ownership (someone else's row), failure, empty, loading,
  and pagination past page one.
- **Name the caches and routes each mutation invalidates.** Item writes must
  `revalidateTag(ORDERABLE_ITEMS_CACHE_TAG, { expire: 0 })` as well as
  `revalidatePath`, or `/orders/new` serves a stale catalogue.
- **Write down the deployment order** for anything touching the database
  (below), and what recovery looks like.
- **No production mutation without explicit authorization.** `db:push`,
  `db:seed` and the catch-up scripts in `supabase/.temp/` are never run by an
  agent, and never against production by anyone without saying so first.

---

## Deployment and recovery

**Order.** Migrations first, then the application — every migration must be
backward-compatible with the app version still running, because the two are
never swapped at the same instant.

1. Apply migrations to staging (`supabase db push` against the staging project).
2. Deploy the app to staging, exercise the changed paths.
3. Apply the same migrations to production.
4. Deploy the app to production.

**Recovery is two different things, and conflating them is how data is lost:**

- **Application rollback** is cheap and instant — redeploy the previous build.
  It undoes nothing in the database.
- **Database recovery** is a restore, with whatever data loss the restore point
  implies. A migration that only adds or replaces functions can be reversed by a
  new forward migration restoring the previous definition. A migration that
  drops or rewrites data cannot.

So: prefer migrations that are reversible by a forward migration, and before any
that is not, say explicitly in the PR what recovery would mean.

---

## Dead code

`npm run check:deadcode` runs [knip](https://knip.dev). It is **advisory** —
`--no-exit-code`, and not in the blocking CI job — because the interesting
question is always "is this deliberate?", which a scanner cannot answer.

Configured exceptions, and why:

- `src/components/ui/**` — vendored shadcn/ui primitives, kept complete so the
  next component that needs `CardFooter` finds it. Not ours to prune.
- The `types` rule is off. Every module in `src/lib/validation/` exports a Zod
  schema **and** its `z.infer` type by convention; the scanner flags all thirty
  of them, which drowns out everything real.
- `tailwindcss` / `tw-animate-css` — reached from CSS `@import`, which knip does
  not follow.
- `src/lib/database.types.ts` — generated.

**Never let this tool drive a deletion in the dormant module.**
`PRODUCTION_LOG_STATUS_LABEL` and `PAYROLL_RUN_STATUS_LABEL` are reported as
unused and are meant to stay: the piece-rate tables, RPCs and RLS still exist,
and the labels are the app-side half of them. The same goes for the SQL —
migrations are not scanned at all, and no scanner's opinion is a reason to drop
a function or a table.

And do not add, remove, or pin a dependency to quiet a report. `undici`
(imported by `src/lib/services/fivem.ts`) used to resolve only through `jsdom`,
a dev dependency, so a production install without dev dependencies would have
lost it. It is now declared directly — a deliberate fix for that fragility, not
a way to make the output shorter.

---

## The checks

| Command                       | What it covers                                            | Needs                    |
| ----------------------------- | --------------------------------------------------------- | ------------------------ |
| `npm run typecheck`           | Strict TypeScript, no `any`                               | —                        |
| `npm run lint`                | ESLint (Next core-web-vitals + TS)                        | —                        |
| `npm run format:check`        | Prettier                                                  | —                        |
| `npm run test`                | Vitest — server actions, validation, formatting, UI units | —                        |
| `npm run db:test`             | Every migration on PGlite, then RLS / RPC / authorization | —                        |
| `npm run check:migrations`    | No historical migration edited, renamed or deleted        | a git base ref           |
| `npm run build`               | Next production build                                     | placeholder env vars     |
| `npm run db:test:concurrency` | Real multi-connection locking behaviour                   | `TEST_DATABASE_URL`      |
| `npm run test:e2e`            | Playwright order lifecycle + access control               | seeded throwaway project |

`npm run validate` runs typecheck, lint, test and db:test — the ones that need
nothing but the repo. `check:migrations` and `build` run in CI alongside them.

The last two need infrastructure that is not assumed to exist locally, so they
are separate jobs: `db:test:concurrency` has its own CI job with a Postgres
service container, and E2E has none until a seedable throwaway Supabase project
exists. **A skipped run is reported as skipped, never as a pass.**

### Optional repository settings, not changed here

Nobody should flip these from a PR; they are the owner's call:

- Require the `verify` and `concurrency-tests` checks on `main` in branch
  protection.
- Add an E2E workflow once an isolated Supabase project exists — it would need
  that project's URL, anon key and service-role key as repository secrets, and
  must never be pointed at production.
