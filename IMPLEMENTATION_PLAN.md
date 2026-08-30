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
| Production pay model      | Piece-rate only. Per-product rate; no fixed job salary in V1     |
| Production approval       | Member logs need Super Admin approval before they count          |
| Production ↔ inventory    | Decoupled in V1 (deferred to 14f); logs are a pay ledger only    |
| Payroll disbursement      | Formal runs: DRAFT → FINALIZED (locks logs) → PAID               |
| Rate snapshot             | Rate + name + unit copied onto `production_logs` at submit       |

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

Phase 14 adds: `0018_production_enums` (production_log_status, payroll_run_status

- new notification/audit/reference values) · `0019_production`
  (production_rates, production_logs, payroll_runs, payroll_run_lines) ·
  `0020_production_rpc` (set_production_rate, submit_production_log,
  review_production_log, cancel_production_log, create_payroll_run,
  finalize_payroll_run, mark_payroll_run_paid) · `0021_production_rls`.

Phase 15 adds: `0024_cash_enums` (cash_direction, cash_entry_source,
cash_category + `CASH_ENTRY` reference / `CASH_ENTRY_*` audit values) ·
`0025_cash` (cash_account singleton balance + append-only cash_entries ledger,
`app.cash_category_direction()`) · `0026_cash_rpc` (`app.post_cash_entry` internal
insertion point, `record_cash_entry`, `reverse_cash_entry`) · `0027_cash_rls`
(Super Admin SELECT only; members have no access) · `0036_cash_handled_by`
(`cash_entries.handled_by` = the Super Admin an entry is attributed to; folded
into the two RPCs. Ships separately because 0024–0027 were pushed before this
column existed; 0025/0026 also carry it for fresh builds via `if not exists`).

Phase 16 adds: `0028_supplier_enums` (`item_category` += `ATTACHMENT`, `TOOL`;
`audit_action` += `SUPPLIER_*`; `reference_type` += `SUPPLIER`) · `0029_suppliers`
(`suppliers` + `supplier_items` price book — buy/sell/max per supplier-item pair) ·
`0030_supplier_rpc` (`create_supplier`, `update_supplier`, `archive_supplier`,
`restore_supplier`, `set_supplier_item` upsert, `remove_supplier_item`) ·
`0031_supplier_rls` (Super Admin SELECT only; members have no access).

Phase 17 adds: `0032_submission_enums` (`member_submission_status`;
`movement_type` += `SUBMISSION`; `reference_type` += `SUBMISSION`;
`notification_type`/`audit_action` += `SUBMISSION_*`) · `0033_submissions`
(`submission_material_types` — MS/EB/EC seeded + mapped to 3 seeded `OTHER`
stock items; `submission_periods` lazy per-month; `submission_period_targets`;
`member_submissions` PENDING→CONFIRMED/REJECTED; `member_submission_lines`
snapshot name+unit) · `0034_submissions_rpc` (`submit_material_submission`
[member, current month only, server-derived], `confirm_member_submission`
[posts signed inventory delta per material], `reject_member_submission`
[reverses posted stock], `set_submission_targets`) · `0035_submissions_rls`
(catalogue/periods/targets readable by any active member; submissions + lines
scoped to owner or Super Admin).

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
(app)/admin/suppliers      /new /[id] /[id]/edit   (+ ?view=catalogue grouped view)
(app)/admin/orders         /[id]
(app)/admin/inventory      /[itemId]
(app)/admin/activity
(app)/admin/audit
(app)/admin/settings
(app)/admin/cash          company treasury ledger  /admin/cash/[id]
(app)/production                    (member: own logs, earnings, payslips)
(app)/submissions                   (member: monthly MS/EB/EC hand-in + history)
(app)/admin/production/rates        per-product piece rates
(app)/admin/production/logs         review queue (approve / reject)
(app)/admin/payroll                 /admin/payroll/new /admin/payroll/[id]
(app)/admin/submissions            monthly submission grid (?month=YYYY-MM)
```

Auth enforced in `proxy.ts` + server actions + RLS.

## Components

`components/ui/*` primitives · `components/patterns/*` (PageHeader, DataTable,
FilterBar, StatusBadge, KpiCard, ActivityFeed, TimelineList, EmptyState,
ConfirmDialog, MoneyText) · `components/<feature>/*` · `components/layout/*` ·
`components/providers/*`.

## Phases

| #     | Phase                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Exit criteria                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 0 ✅  | Scaffold + tooling + tokens + shared enums + CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `npm run validate` + `build` green                           |
| 1 ✅  | Supabase schema, RLS, RPC, hand-authored types, seed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 14 migrations + 48 PGlite RLS/RPC assertions pass            |
| 2 ✅  | Auth: login/logout, proxy session gate, ACTIVE enforcement, password change, admin service client                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | login flow + guards typecheck/build green; proxy wired       |
| 3 ✅  | App shell: sidebar + mobile drawer, theme toggle, role-aware nav, admin gate, primitives + patterns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | responsive shell; all routes stubbed; validate + build green |
| 4 ✅  | Items catalogue: admin CRUD via RPC (audited), soft-delete/restore, filter + sort + server pagination                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 55 DB assertions; validate + build green                     |
| 5 ✅  | Orders (member): multi-item builder + estimate, create via RPC, list (scope tabs), detail + timeline, cancel, "I've paid"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | validate + build green; RPC path covered by DB tests         |
| 6 ✅  | Orders (admin): list + 3 status filters + search, 3-dimension detail, full workflow (process / verify / reject / distribute / complete / cancel), member card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | validate + build green; transitions guarded in DB            |
| 7 ✅  | Inventory: stock list (search + low-stock filter), item detail + movement history, add / remove / set-count dialog via RPC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | validate + build green                                       |
| 8 ✅  | Notifications: centre (all / unread tabs), toned rows, mark read / mark all read, top-bar bell with live unread badge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | validate + build green                                       |
| 9 ✅  | Members: list (search + status/role filter, order counts), create (service-role auth user + profile), edit, deactivate/reactivate, admin password reset, recent orders — self-lockout guarded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | validate + build green                                       |
| 10 ✅ | Activity feed + Audit log (action filter, before/after JSON dialog) — both admin-only, append-only in DB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | validate + build green                                       |
| 11 ✅ | Dashboards: admin (KPIs, attention queue, recent activity, low stock, recent orders) + member (counts, active/recent orders, recent notifications) — all live queries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | validate + build green                                       |
| 12    | Settings + profile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | theme + org display; password change                         |
| 13    | Hardening: empty/loading/error, a11y, responsive, indexes, PRD §38 E2E                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | acceptance workflow passes                                   |
| 14 ✅ | Production & piece-rate wages: schema/RPC/RLS (14a), member `/production` log + earnings + payslips (14b), admin pay rates + review queue (14c), payroll runs DRAFT→FINALIZED→PAID (14d), dashboard tiles + seed (14e)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | validate + build green; +21 PGlite assertions (84 total)     |
| 14f   | **Deferred** — approved production log → `PRODUCTION` inventory movement (type already exists). Not built; agree scope first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                            |
| 15 ✅ | Company cash: single treasury. `cash_account` balance + append-only `cash_entries` (income/expense, own Note column, `handled_by` = attributed Super Admin picked at record time), `record_cash_entry` / `reverse_cash_entry` RPCs, Super-Admin-only RLS, `/admin/cash` (balance + month KPIs + filterable ledger + record dialog) + `/admin/cash/[id]` (detail + back link + reverse), dashboard KPI. `handled_by` shipped as `0036` (0024–0027 were already pushed). `app.post_cash_entry` left as the seam for the order-revenue and payroll-expense hooks.                                                                                                                                                                                   | validate + build green; PGlite assertions pass               |
| 15a   | **Deferred** — auto-post cash on order `PAID` (`source=ORDER`) and payroll `PAID` (`source=PAYROLL_RUN`). Seam ready (`app.post_cash_entry`); agree gross-vs-net first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                            |
| 16 ✅ | Suppliers: `suppliers` + `supplier_items` price book (buy / sell / max quanti per supplier-item pair), audited CRUD RPCs, Super-Admin-only RLS. `/admin/suppliers` (list + `?view=catalogue` sheet-style grouped view), `/admin/suppliers/[id]` (per-supplier price book editor), `/admin/suppliers/new` + `/[id]/edit`, "Sourced from" panel on the item edit page. Member catalogue + order path untouched (`items.price` stays the only member-facing price). Real roleplay catalogue + 10 suppliers / 99 lines injected via the seed; `item_category` gains `ATTACHMENT` + `TOOL`. Max quanti is reference only.                                                                                                                             | validate + build green; +9 PGlite assertions                 |
| 16a   | **Deferred** — per-order max-quantity enforcement, and any procurement / purchase-order / cash hookup for `supplier_items`. Not built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                                                            |
| 17 ✅ | Monthly material submissions: `submission_material_types` (MS/EB/EC seeded + mapped to stock items), lazy `submission_periods` (auto-open on the 1st, no finalize), per-month `submission_period_targets` (informational), `member_submissions` PENDING→CONFIRMED/REJECTED with `member_submission_lines` snapshots. RPCs `submit_material_submission` (member, current month, server-derived) / `confirm_member_submission` (posts signed inventory delta per material) / `reject_member_submission` (reverses stock) / `set_submission_targets`. `/submissions` (member form + history + dashboard nag) + `/admin/submissions` (month grid, confirm/adjust/reject, editable targets) + admin dashboard attention rows. Migrations `0032–0035`. | validate + build green; +17 PGlite assertions                |
| 17a   | **Deferred** — material-type CRUD UI (the 3 types are seeded; add a 4th via SQL for now), and any pay/cash valuation of submitted materials. Not built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                            |

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
6. PRD/original `CLAUDE.md` deferred "production" and "wages" out of V1. Both are
   now in scope by the owner's direction (Phase 14), same as the earlier
   `/admin/fivem` monitor decision. `CLAUDE.md` updated; the inventory hookup
   (14f) and member inventory requests remain out of scope.
