# Crimson Creed Operations System — Implementation Plan

Derived from `Crimson_Creed_Operations_System_PRD.pdf` (source of truth). This
file records the agreed architecture and phase breakdown. Update it as decisions
change.

## Stack

Next.js 16 (App Router, RSC, Server Actions) · React 19 · TypeScript strict ·
Tailwind CSS v4 + CSS-variable tokens · hand-authored Radix primitives (Untitled
UI visual benchmark) · Supabase (Postgres + Auth + RLS) · Postgres RPC for atomic
writes · Zod · TanStack Query + nuqs · next-themes · Vitest + Playwright.

## Layering

UI (RSC/client) → Server Actions/Route Handlers (auth guard + Zod parse) →
`lib/services/*` (business rules) → `lib/db/*` + `supabase.rpc()` → Postgres
functions + RLS (atomic writes, final authorization).

## Resolved open questions (PRD §9 etc.)

| Topic                     | Decision                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `order_status`            | PENDING → PROCESSING → COMPLETED; plus CANCELLED, REJECTED       |
| `payment_status`          | UNPAID → PAYMENT_SUBMITTED → PAID; plus PAYMENT_REJECTED         |
| `distribution_status`     | NOT_DISTRIBUTED → DISTRIBUTED                                    |
| Fonts                     | Inter for body + headings; `--font-display` token kept as a seam |
| UI kit                    | Hand-authored Radix components themed to Untitled UI tokens      |
| Seed                      | `supabase/seed.ts` via `tsx`, admin API for auth users           |
| Supabase                  | Hosted project (no local Docker here); `.env.local` + `db:push`  |
| Layout width              | Fluid shell, content max-width 1536px, tables full-bleed         |
| Self-serve password reset | Not in V1 — admin reset only                                     |

These enum sets live in one place: `src/lib/constants/enums.ts` +
`supabase/migrations/0001_enums.sql`.

## Database (migrations, in order)

`0001_enums` · `0002_members` · `0003_items` · `0004_orders` · `0005_order_items`
· `0006_inventory` (+`inventory_movements`) · `0007_notifications` ·
`0008_order_timeline` · `0009_activity_logs` · `0010_audit_logs` ·
`0011_functions` (create_order, submit_payment, verify_payment, start_processing,
mark_distributed, complete_order, cancel_order, reject_order, adjust_inventory) ·
`0012_rls` (+ `is_super_admin()`, `current_member_id()` SECURITY DEFINER helpers)
· `0013_seed_support` (dev only).

Data rules: server-side totals; price + item-name snapshots on `order_items`;
inventory mutated only by functions via movements; append-only audit;
soft-delete/inactive for referenced records.

## Routes

```
(auth)/login
(app)/                     -> redirect to /dashboard
(app)/dashboard            role-aware
(app)/orders               (member: own) /orders/new /orders/[id]
(app)/notifications
(app)/profile
(app)/admin/members        /new /[id]
(app)/admin/items          /[id]
(app)/admin/orders         /[id]
(app)/admin/inventory      /[itemId]
(app)/admin/activity
(app)/admin/audit
(app)/admin/settings
```

Auth enforced in `proxy.ts` + server actions + RLS.

## Components

`components/ui/*` primitives · `components/patterns/*` (PageHeader, DataTable,
FilterBar, StatusBadge, KpiCard, ActivityFeed, TimelineList, EmptyState,
ConfirmDialog, MoneyText) · `components/<feature>/*` · `components/layout/*` ·
`components/providers/*`.

## Phases

| #    | Phase                                                                                                 | Exit criteria                                                    |
| ---- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 0 ✅ | Scaffold + tooling + tokens + shared enums + CI                                                       | `npm run validate` + `build` green                               |
| 1 ✅ | Supabase schema, RLS, RPC, hand-authored types, seed                                                  | 14 migrations + 48 PGlite RLS/RPC assertions pass                |
| 2 ✅ | Auth: login/logout, proxy session gate, ACTIVE enforcement, password change, admin service client     | login flow + guards typecheck/build green; proxy wired           |
| 3 ✅ | App shell: sidebar + mobile drawer, theme toggle, role-aware nav, admin gate, primitives + patterns   | responsive shell; all routes stubbed; validate + build green     |
| 4 ✅ | Items catalogue: admin CRUD via RPC (audited), soft-delete/restore, filter + sort + server pagination | 55 DB assertions; validate + build green                         |
| 5    | Orders (member): builder, server price preview, create RPC, own list/detail, cancel, timeline         | E2E: member create/view/cancel; totals server-authoritative      |
| 6    | Orders (admin): list + filters, 3-dimension detail, transition workflow, payment verify, distribution | illegal transitions rejected; transitions write timeline + audit |
| 7    | Inventory: stock view, movements, adjustments, low-stock                                              | adjustment = movement + qty update, atomic                       |
| 8    | Notifications: centre, unread count, read/unread, event triggers                                      | RLS-scoped; count accurate                                       |
| 9    | Members management (admin CRUD, rank, order history)                                                  | no password data exposed                                         |
| 10   | Activity + Audit feeds                                                                                | audit immutable to non-admin                                     |
| 11   | Dashboards (admin + member)                                                                           | all numbers from live queries                                    |
| 12   | Settings + profile                                                                                    | theme + org display; password change                             |
| 13   | Hardening: empty/loading/error, a11y, responsive, indexes, PRD §38 E2E                                | acceptance workflow passes                                       |

## Known PRD/codebase conflicts

1. PRD PDF lost several diagram/table sections (§7 nav, §9 status lists, §12
   timeline example, §20 routes, §22 column defs, §24 flow diagrams, §35
   roadmap, §37 dev sequence, §38 DoD steps). Working assumptions above; revisit
   if originals surface.
2. Global font standard vs PRD's explicit Inter request — resolved in PRD's
   favour, documented in `CLAUDE.md`.
3. Admin create-user / password-reset need the service-role key server-side and a
   provisioned Supabase project before Phase 2 runs end-to-end.
4. "Inactive members cannot log in" needs enforcement in proxy + RLS (Supabase
   Auth has no native disable-login).
5. Local content width standard (1440px) relaxed to 1536px + full-bleed tables
   for admin density.
