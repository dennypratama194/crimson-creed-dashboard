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

`supabase/migrations/` is the single, ordered, forward-only history — currently
**58 files, `0001` → `0058`**.

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

`src/lib/database.types.ts` is hand-maintained. After a schema change either
edit it by hand or run `npm run db:types` against the **dev** project — then
re-apply the typed jsonb RPC payloads (`AdminDashboardPayload`,
`CashSummaryPayload`, `EarningsSummaryPayload`, `PayslipPayload`), which the
generator emits as plain `Json`. `npm run typecheck` will flag any mismatch.

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
