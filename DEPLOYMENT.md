# Deployment & environment separation

Local dev and the Vercel deployment must use **two separate Supabase projects**.
This file is the runbook for setting that up and for keeping them in sync
afterwards.

| Environment | Supabase project            | Env file        | Data                           |
| ----------- | --------------------------- | --------------- | ------------------------------ |
| Local dev   | the current project         | `.env.local`    | dummy data (`npm run db:seed`) |
| Production  | a **new**, separate project | Vercel env vars | real data only                 |

`git push` / a Vercel deploy ships **code only** — it never copies database
rows. Your machine never holds the production connection string, so nothing you
do locally can write to production.

---

## One-time: split into two projects

1. **Create a new Supabase project** for production (Singapore region to match
   `vercel.json`). Save the DB password.

2. **Point the CLI at it and push the schema:**

   ```bash
   npx supabase link --project-ref <PROD-REF>
   npx supabase db push          # applies every migration in supabase/migrations
   ```

3. **Make a throwaway prod env file** (git-ignored by `.env*`):

   ```bash
   cp .env.local .env.prod.local
   # edit: NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SERVICE_ROLE_KEY → the new project
   #       SUPABASE_PROJECT_ID → <PROD-REF>
   #       SUPABASE_ENV="production"
   ```

4. **Load the catalogue (Items) into production** — nothing else:

   ```bash
   npx tsx --env-file=.env.prod.local supabase/import-catalogue.ts
   npx tsx --env-file=.env.prod.local supabase/backfill-item-images.ts
   ```

5. **Create one real Super Admin:**

   ```bash
   npx tsx --env-file=.env.prod.local supabase/create-admin.ts
   ```

6. **Point Vercel at the new project** (Production scope), then redeploy:

   ```bash
   npx vercel env rm NEXT_PUBLIC_SUPABASE_URL production
   npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
   npx vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY production
   npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   npx vercel env rm SUPABASE_SERVICE_ROLE_KEY production
   npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
   npx vercel --prod
   ```

   Decide what **Preview** deployments use too — point them at the prod project
   or a third throwaway project, not your dev database.

7. **Restore local dev:**

   ```bash
   npx supabase link --project-ref <DEV-REF>   # back to the dev project
   rm .env.prod.local                          # or keep it for future prod runs
   ```

   `.env.local` is untouched, so local keeps all its dummy data.

---

## Migration rules

`supabase/migrations/` is the single, ordered, forward-only history. Read the
directory for what exists; `npm run check:migrations` compares it with the base
branch, and `npx supabase migration list` compares it with a linked project.

- **Never edit a migration that has been applied anywhere.** Production and dev
  record applied versions in `supabase_migrations.schema_migrations`; an edited
  file is silently skipped there and diverges from a fresh build. Fix forward
  with a new file.
- **New migration** = the next number + a short snake_case description, e.g.
  `0059_order_export_rpc.sql`. Start it with a header comment saying what it does
  and whether it is additive.
- **Prefer additive changes**: `create or replace function`,
  `create index if not exists`, new columns with defaults. Do not drop or rename
  tables, columns, functions or RPC parameters without an explicit, agreed plan.
- **Every new SECURITY DEFINER function** pins
  `set search_path = public, pg_temp`, self-authorizes as its first statement
  (`app.require_super_admin()` or the caller resolved from `auth.uid()`), and
  ends with `revoke all … from public, anon` plus
  `grant execute … to authenticated, service_role`. `db:test` fails if an admin
  RPC is callable by a member or if anon can execute anything.
- **New user-writable text columns** carry a `*_max_len` CHECK (see 0046).
- **Test locally:** `npm run db:test` applies every migration to PGlite. Add
  assertions for the new behaviour to `supabase/tests/schema.mjs`.

### Database types

`src/lib/database.types.ts` is **generated output**. `npm run db:types`
(`scripts/gen-types.mjs`) replaces it whole, preferring a local or explicit
throwaway database (`DB_URL=…`) over the hosted project. Never put anything
hand-authored in it. Where no generator can run (no linked project, no Docker)
it is edited to match the migrations **in the generator's own shape** — function
signatures with `Returns: Json` for jsonb — so the next real regeneration is a
no-op rather than a loss.

The typed shapes of jsonb RPC payloads live in `src/lib/db/contracts.ts`, as a
Zod schema plus its type, and are parsed once where the data arrives
(`parseRpcPayload`). No generator touches that file. `npm run typecheck` flags
a signature mismatch; a payload shape drift fails at the parse.

## Every time you add a feature that needs the database

Data never clashes between the two projects, but **schema does** — production
running new code against an old schema will break. So:

1. Write the migration(s) in `supabase/migrations/` (rules above).
2. Apply to **dev** and build against dummy data:
   ```bash
   npx supabase link --project-ref <DEV-REF>
   npx supabase db push
   ```
3. `npm run validate` and `npm run build`.
4. **Back up production** before applying anything: Dashboard → Database →
   Backups (confirm a recent backup exists, or create a manual one), or
   `npx supabase db dump --linked -f prod-backup-$(date +%F).sql` while linked to
   production.
5. Apply the **same** migrations to production **before** pushing the code that
   needs them (a Vercel deploy starts on push):
   ```bash
   npx supabase link --project-ref <PROD-REF>
   npx supabase migration list   # shows local vs remote — confirm what's pending
   npx supabase db push
   npx supabase link --project-ref <DEV-REF>   # link back to dev
   ```
   If you apply a file through the Dashboard SQL editor instead, record it so
   the CLI does not try to re-apply it later:
   `npx supabase migration repair --status applied <version>`.
6. Push the code; smoke-test the affected pages.

`npm run db:migrations` is a shortcut for `supabase migration list` against the
currently-linked project.

## `pending-migrations.sql` (superseded — do not run)

A one-off catch-up script from September 2026 that bundled `0046 → 0052` for a
single paste into the production SQL editor. Those migrations are in
`supabase/migrations/` and have since been followed by `0053+`. Running it again
would re-apply old function bodies outside the migration history. It is kept
only as a record; use the normal workflow above for everything new.

## Release notes — hardening pass (migrations 0056–0058)

All three are **additive** (new functions and indexes only; no table, column,
policy, data or existing-RPC changes) and safe to re-run.

| Migration                  | Adds                                                                                                                                     | Affects                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `0056_admin_dashboard_rpc` | `public.admin_dashboard()` — SECURITY DEFINER, Super-Admin-gated                                                                         | reads members, orders, items, inventory, cash, payroll, production, submissions, activity |
| `0057_aggregate_read_rpcs` | `cash_summary(timestamptz, timestamptz)`, `my_earnings_summary()`, `my_payslips()`, `member_order_counts(uuid[])`                        | read-only; cash/member counts Super-Admin-gated, `my_*` caller-scoped                     |
| `0058_query_indexes`       | `orders (member_id, created_at desc)`, `notifications (recipient_id, created_at desc)`, `inventory_movements (item_id, created_at desc)` | brief write lock per table while each index builds                                        |

**Order:** back up → apply `0056`, `0057`, `0058` to production (`db push`) →
confirm `migration list` shows them applied → push the code. The new code calls
these RPCs from `/dashboard` (admins), `/admin/cash`, `/admin/members` and
`/production`; deploying code first breaks those pages until the SQL is applied.
No Supabase dashboard setting changes are required. Optionally add
`TRUST_PROXY_HEADERS=1` only if the app is served behind a trusted reverse proxy
other than Vercel.

**Rollback:** revert the code first (redeploy the previous commit). The
migrations only add objects, so leaving them in place is harmless. If they must
go, after the code revert run
`drop function if exists public.admin_dashboard(), public.cash_summary(timestamptz, timestamptz), public.my_earnings_summary(), public.my_payslips(), public.member_order_counts(uuid[]);`
and `drop index if exists orders_member_created_at_idx, notifications_recipient_created_at_idx, inventory_movements_item_created_at_idx;`,
then `npx supabase migration repair --status reverted 0056 0057 0058`.

---

## Release notes — review hardening (migrations 0077–0080)

| Migration                                      | Changes                                                                                                                                                                                                                                                                          | Reversible by a forward migration                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `0077_reassert_drop_create_distributable_item` | Re-issues 0068's idempotent `drop function if exists create_distributable_item` so a database that skipped the out-of-order 0068 reaches the same end state. No-op where 0068 ran.                                                                                               | Yes (re-create from 0064) — but the drop is intended.                                                   |
| `0078_auth_throttle_concurrency`               | `hit_auth_throttle` creates buckets with `insert … on conflict do nothing` then locks; the sweep runs after the caller holds its key and uses `skip locked`. Pins `search_path` on both throttle functions. Same signature, same fixed-window semantics.                         | Yes — restore the 0047 body.                                                                            |
| `0079_member_action_quota`                     | New `member_action_throttle` table (RLS on, no policies) + `app.consume_member_action`. `create_order`, `submit_order_payment`, `cancel_order`, `submit_material_submission` redefined with the quota as their first data access. Signatures, return types and grants unchanged. | Yes — restore the 0045 / 0053 / 0055 / 0013 bodies; the table can stay or be dropped (no app reads it). |
| `0080_bounded_read_rpcs`                       | Read-only RPCs `admin_submission_month(date)`, `my_submission_history(int, int)`, `supplier_item_counts(uuid[])`. No table or index changes.                                                                                                                                     | Yes — drop the three functions.                                                                         |

**Order — database first, then the app.** Every migration here is backward-
compatible with the app build that is live while it runs:

- the previous build never calls the 0080 RPCs, and its Server Actions still
  run their own `checkRateLimit` before the RPC — with 0079 applied a member is
  briefly counted by both, which can only make the limit stricter for the length
  of the deploy, never looser;
- 0078 keeps the `hit_auth_throttle` signature and return value.

1. Back up production (see step 4 above).
2. `npx supabase migration list` against the target. Confirm what is pending —
   and whether **0068** is listed as applied (see below).
3. Apply `0077` → `0080` to staging, deploy the app to staging, exercise: place
   an order, report a payment, cancel, submit materials, `/admin/submissions`,
   `/admin/suppliers` (both views), `/submissions` history paging, the
   notification badge, and a deactivated member's session.
4. Apply the same migrations to production, then deploy the app.

The new app build **requires** 0080 (`/admin/submissions`, `/submissions`,
`/admin/suppliers` call the new RPCs) and relies on 0079 for member rate
limiting (it no longer checks in the Server Action). Deploying the app before
the migrations breaks those pages and leaves member mutations unthrottled.

**Recovery.** App rollback is a redeploy of the previous build; it is safe with
the migrations left in place (see the compatibility notes above). A database
rollback is a forward migration restoring the previous function bodies — none
of these four migrations rewrites or deletes data, so no restore is needed to
undo them. `member_action_throttle` only ever holds counters.

**Migration-history reconciliation — check before pushing.**

- **0068** sits below 0069–0073, which reached `main` first. The production
  catch-up script (`supabase/.temp/remaining.sql`, never to be re-run) records
  `0068` in `supabase_migrations.schema_migrations`, so it was **not** renamed
  or deleted here. If `migration list` shows 0068 as applied, nothing to do. If
  it shows 0068 as pending on a database already past 0073, `db push` will
  refuse the out-of-order file: either run `npx supabase db push --include-all`
  (it only drops a function that is already gone once 0077 runs), or apply 0077
  and then `npx supabase migration repair --status applied 0068`.
- **0045** was once edited on a branch to tolerate an environment where its
  columns had been added by hand before the migration was recorded. That edit
  was reverted: the file is byte-identical to `main` again, as the migration
  guard requires. If such an environment still has 0045 **pending**, a push
  aborts on `add column`. Reconcile it deliberately — confirm the columns and
  constraint match 0045, apply the rest of 0045 by hand, then
  `npx supabase migration repair --status applied 0045`. Do not edit the file.

## Guardrails in the repo

- **`SUPABASE_ENV`** in every env file marks it `development` or `production`.
- **`supabase/_env-guard.ts`**:
  - `announceTarget()` — every data script prints the host + marker it is about
    to hit, so you always see which database you are touching.
  - `assertSafeToWipe()` — `db:seed` (the only destructive script) **exits**
    unless `SUPABASE_ENV=development`. Override a deliberate prod reset with
    `ALLOW_DESTRUCTIVE=1`.
- `import-catalogue.ts`, `backfill-item-images.ts` and `create-admin.ts` are
  non-destructive (upsert / insert only) and run against either environment —
  they just announce the target.
- `.env.prod.local` is covered by `.gitignore`'s `.env*` rule — never commit it.
