# Crimson Creed Operations System

Private internal operations platform for a single FiveM / GTA V roleplay
organization. Operational record-keeping only — **no real-world transactions or
real-money payments**. The "payment", "cash" and "payroll" workflows record
fictional in-game currency.

The V1 PRD (`Crimson_Creed_Operations_System_PRD.pdf`) is referenced throughout
the code and plans but is **not committed to this repository** — ask the owner
for a copy. `IMPLEMENTATION_PLAN.md` records the agreed architecture, the phase
breakdown and every deferred module; `CLAUDE.md` holds the working rules.

## What's built

- **Auth** — username/password (Supabase email is synthesised), INACTIVE
  lockout, admin-managed accounts and password resets, rate-limited sign-in.
- **Orders** — member order builder (price + name snapshotted, totals computed
  server-side), order list / detail / timeline, "I've paid" with a named
  Super Admin recipient; admin workflow (verify / record / reject payment,
  processing, distribution with stock draw-down, complete, cancel / reject).
- **Catalogue + company stash** — catalogue items with soft-delete and
  thumbnails; `/admin/inventory` ("Company stash") covers catalogue stock, raw
  materials, tools and seized property with an immutable movement ledger.
- **Production & piece-rate payroll** — member production logs, Super Admin
  approval, pay rates, payroll runs `DRAFT → FINALIZED → PAID` (the member
  `/production` page exists but is hidden from the member nav for now).
- **Company cash** — single treasury ledger with reversals (`/admin/cash`).
- **Suppliers** — Super-Admin-only price book (`/admin/suppliers`).
- **Monthly material submissions** — member hand-ins of metal scrap / bottles /
  cans, admin confirm / reject posting stock, optional order gate (ships off).
- **Relations** — relations grid with metal-scrap settlement (`/admin/relations`).
- **FiveM monitor** — live player list via a relay (`/admin/fivem`).
- **Notifications**, **members management**, **activity + append-only audit
  feeds**, **role-aware dashboards**, **profile**.

**Deferred — not built:** production → inventory movements (14f), automatic
cash posting from orders / payroll (15a), per-order supplier max-quantity or
procurement (16a), material-type CRUD / material valuation (17a), member
inventory requests. See `IMPLEMENTATION_PLAN.md`.

Every multi-table write goes through an audited Postgres RPC; RLS is the final
authorization boundary.

## Stack

| Concern       | Choice                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| Framework     | Next.js 16 (App Router, RSC, Server Actions), React 19                        |
| Language      | TypeScript (strict, `noUncheckedIndexedAccess`)                               |
| Styling       | Tailwind CSS v4 + CSS-variable design tokens                                  |
| UI primitives | Hand-authored Radix-based components                                          |
| Database      | Supabase — PostgreSQL, Auth, Storage, Row Level Security                      |
| Server writes | Postgres RPC functions (atomic multi-table operations)                        |
| Validation    | Zod (shared client + server)                                                  |
| Data (client) | TanStack Query + nuqs (URL-synced table state)                                |
| Theme         | next-themes (light / dark / system)                                           |
| Tests         | Vitest (unit + server actions), PGlite (schema / RLS / RPC), Playwright (E2E) |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev
```

There is no local Docker stack; development targets a hosted Supabase project.
`SUPABASE_SETUP.md` is the first-time runbook; `DEPLOYMENT.md` covers the
separate production project, migrations and deploy order.

## Scripts

| Script                  | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `npm run dev`           | Dev server (Turbopack)                                             |
| `npm run build`         | Production build                                                   |
| `npm run typecheck`     | Route type generation + `tsc --noEmit`                             |
| `npm run lint`          | ESLint                                                             |
| `npm run format:check`  | Prettier check (`npm run format` writes)                           |
| `npm run test`          | Vitest: pure logic, validation schemas, server actions             |
| `npm run db:test`       | Apply every migration to in-process PGlite; RLS / RPC checks       |
| `npm run test:e2e`      | Playwright E2E — needs a seeded hosted project (`e2e/README.md`)   |
| `npm run validate`      | typecheck + lint + test + db:test (run before commits)             |
| `npm run db:migrations` | `supabase migration list` for the linked project                   |
| `npm run db:push`       | `supabase db push` to the linked project                           |
| `npm run db:seed`       | Wipe + seed dummy data (refuses unless `SUPABASE_ENV=development`) |

`db:test` needs no database or Docker — it applies all migrations to an
in-memory PostgreSQL (PGlite), stubs the Supabase `auth` / `storage` schemas,
and exercises the workflows, RLS visibility, the SECURITY DEFINER authorization
matrix, and re-applies the newest migrations to check they are idempotent. CI
(`.github/workflows/ci.yml`) runs typecheck, lint, Prettier, Vitest, `db:test`
and the build; it never touches a Supabase project.

## Database

`supabase/migrations/` holds **58 ordered, forward-only migrations**
(`0001_init_helpers.sql` … `0058_query_indexes.sql`). Applied migrations are
never edited — every schema, RPC, RLS or index change is a new file with the
next number. The workflow, deploy order and type regeneration are in
`DEPLOYMENT.md`.

`src/lib/database.types.ts` is **hand-maintained** to match the migrations,
including typed payloads for the jsonb RPCs (`AdminDashboardPayload`, …). If
you regenerate it with `npm run db:types`, re-apply those payload types — the
generator emits them as plain `Json`.

## Data flow

UI → server action / route handler (session guard + Zod) → `src/lib/db/*` →
Supabase (RPC or RLS-scoped select) → Postgres.

- **Admin dashboard** — one round-trip. `getAdminDashboard()` calls
  `admin_dashboard()` (migration 0056), which checks `app.require_super_admin()`
  and returns every KPI, the attention counts, the 90-day order trend (UTC
  days), recent activity, low-stock items and recent orders as one jsonb
  payload. The TS layer only derives the period-over-period percentages.
- **Member dashboard** — one round-trip via `member_dashboard()` (0050).
- **Aggregations run in SQL** — `cash_summary()`, `my_earnings_summary()`,
  `my_payslips()` and `member_order_counts()` (0057). The `my_*` functions are
  scoped to the calling member even for a Super Admin.
- **Stash list** — search, filter, ordering and pagination run in Postgres; stock
  quantities are fetched for the visible page only.
- **Member catalogue** — `getOrderableItems()` is `unstable_cache`d and
  invalidated by the item write actions.

## Rate limiting

`src/lib/rate-limit.ts`, backed by the `hit_auth_throttle` RPC (service-role
only).

- **Sign-in:** 8 attempts per username and 50 per IP per 15 minutes; password
  change: 5 per member per 15 minutes. The per-IP limit uses only
  platform-set headers — trusted on Vercel, or behind a proxy you mark with
  `TRUST_PROXY_HEADERS=1`; otherwise it is skipped and the per-username limit
  stands alone.
- **Member mutations** (orders, production, submissions) are capped per member
  per minute.
- **When the database limiter is unreachable:** auth endpoints fall back to an
  in-process limiter (per server instance — weaker on multi-instance hosting,
  but never fails open to zero protection); member mutations fail open. Neither
  path fails closed, so a database outage cannot lock everyone out. For
  stronger edge protection add a Vercel Firewall rate-limit rule on `POST
/login`. The limiter is never an authorization boundary.

## Project layout

```
src/
  app/                 routes (App Router), server actions, route handlers
  components/
    ui/                primitives (Button, Input, Badge, Table, Dialog, …)
    patterns/          composed patterns (PageHeader, Pagination, StatusBadge, …)
    layout/            app shell, sidebar, top bar
    providers/         client context providers
  lib/
    constants/         domain enums, labels, status tone + transition config
    supabase/          browser / server clients, service-role admin client
    auth/              session + role guards, sign-in actions
    db/                typed data-access functions
    services/          orchestration (FiveM monitor)
    validation/        Zod schemas
    format/            money / date formatters
    database.types.ts  hand-maintained schema types
supabase/
  migrations/          ordered SQL migrations (forward-only)
  tests/schema.mjs     PGlite schema / RLS / RPC suite
  seed.ts              development seed script (destructive, dev only)
e2e/                   Playwright specs (hosted project required)
tools/                 FiveM relay / uplink scripts (run outside the app)
```

## Roles

Two application roles only: `SUPER_ADMIN` and `MEMBER`. Organizational rank
(`MEMBER_RANKS` in `src/lib/constants/enums.ts`) is profile metadata and has
**no authorization effect**. Authorization is enforced in the proxy, in server
actions, inside every SECURITY DEFINER RPC, and in Postgres RLS — never in the
UI alone.
