@AGENTS.md

# Crimson Creed Operations System — project rules

The PRD (`Crimson_Creed_Operations_System_PRD.pdf`) is the source of truth.
`IMPLEMENTATION_PLAN.md` tracks the agreed architecture and phase breakdown.

## Non-negotiables (from the PRD)

- Two app roles only: `SUPER_ADMIN`, `MEMBER`. Rank never affects permissions.
- Order prices and item names are **snapshotted** onto `order_items` at
  submission. Historical orders never change when the catalogue changes.
- Order totals are computed **server-side**. Never trust `member_id`, `role`,
  `price`, totals, or inventory quantities from the browser.
- Inventory changes are **movements**, never direct edits to `current_quantity`.
- Multi-table operations go through Postgres RPC functions and are atomic.
- Authorization is enforced in the proxy + server actions + RLS. The UI only
  hides controls; hiding is not a security boundary.
- Members can cancel only their own `PENDING` orders.
- Production pay is **piece-rate**. The per-unit rate, product name, and unit are
  **snapshotted** onto `production_logs` at submission; changing a rate never
  rewrites historical pay. Payout is computed **server-side**
  (`quantity × snapshot rate`) — never trusted from the browser.
- Member production logs require Super Admin approval (`PENDING → APPROVED /
REJECTED`) before they count. A finalized `payroll_run` locks its approved
  logs (`payroll_run_id`) so they cannot be re-reviewed or paid twice.
- Soft-delete / inactive flags for anything referenced historically. No hard
  deletes of referenced items or members.
- Audit log is append-only for non-service roles.

## Conventions

- Strict TypeScript. No `any` (lint error). No business logic in components.
- Domain strings come from `src/lib/constants/` — never inline enum literals or
  category strings in UI.
- Consume semantic CSS tokens (`bg-background`, `text-muted-foreground`,
  `--tone-*`), never raw palette hex.
- Server data access lives in `src/lib/db/*`; orchestration in
  `src/lib/services/*`; Zod schemas in `src/lib/validation/*`.
- Rate limiting goes through `src/lib/rate-limit.ts` (`checkRateLimit` /
  `rateLimitHit`), backed by the `hit_auth_throttle` RPC. Member-facing mutating
  server actions that fan out notifications (orders, production, submissions) are
  capped per member; auth endpoints use a 15-minute window. The limiter fails
  open — never rely on it as an authorization boundary.
- Free-text columns writable from the browser carry a length ceiling
  (`*_max_len` CHECK constraints, migration 0046). Add one for any new
  user-supplied text column.
- The member dashboard is one round-trip: `public.member_dashboard()` (migration 0050) returns every count + row list as jsonb; `getMemberDashboard` only
  derives the trend baseline. Changing what the member dashboard shows means
  editing that RPC, not adding a query. The admin dashboard is still
  query-per-widget in `getAdminDashboard` (few callers, no herd pressure).
- `getOrderableItems` is `unstable_cache`d (tag `ORDERABLE_ITEMS_CACHE_TAG`);
  the four item write actions call `revalidateTag(tag, { expire: 0 })`. Any new
  path that mutates `items` visibility/price must do the same.
- Every list has an intentional empty state; every async view has skeletons;
  errors are non-technical. Dangerous actions use a confirm dialog.
- Production & piece-rate wages ARE implemented (Phase 14) — `production_rates`,
  `production_logs`, `payroll_runs`, `payroll_run_lines`, under `/production` and
  `/admin/production/*` + `/admin/payroll/*`. Approved production does **not** yet
  touch inventory (deferred to 14f); do not wire that without agreeing it first.
- Suppliers ARE implemented (Phase 16) — `suppliers` + `supplier_items` (a price
  book: buy / sell / max-quanti per supplier-item pair), audited CRUD RPCs,
  Super-Admin-only RLS, under `/admin/suppliers`. Super Admin only: members never
  see suppliers or costs. `items.price` stays the single member-facing price;
  `supplier_items.sell_price` is informational and does **not** feed order totals.
  Max quanti is reference only — the member order path and `create_order` are
  untouched. Do not wire per-order caps or any procurement/cash hookup without
  agreeing it first (16a).
- Monthly material submissions ARE implemented (Phase 17) — members hand in
  metal scrap / empty bottles / cans each month. `submission_material_types`
  (MS/EB/EC, seeded, each mapped to a stock item), lazy `submission_periods`
  (auto-open on the 1st, **no finalize/lock**), informational per-month
  `submission_period_targets`, `member_submissions` PENDING→CONFIRMED/REJECTED
  with snapshot lines. Under `/submissions` (member) and `/admin/submissions`
  (Super Admin grid — which also carries a "Submit my hand-in" button so a
  Super Admin can file their own current-month submission without leaving the
  admin view; no separate nav entry). Members submit for the **current month
  only** (plus owed
  past months once the gate below is on); a CONFIRMED submission **posts
  inventory movements** (`movement_type='SUBMISSION'`) for the signed delta, and
  rejecting a confirmed one reverses that stock. Targets never block a
  submission. Every submission records a **PIC** —
  `member_submissions.received_by` (a Super Admin) + `received_by_name` snapshot,
  required at submit, correctable at confirm; the member picker is fed by the
  `list_submission_receivers()` RPC. Do not add material-type CRUD UI or any
  pay/cash valuation of materials without agreeing it first (17a).
- The **submission order gate** (Phase 17b) is implemented but ships **off**.
  `organization_settings.submission_gate_enabled` + `submission_obligation_start_month`
  (Super-Admin `set_submission_gate` RPC, control on `/admin/submissions`). When
  on, `create_order` refuses while `app.member_owed_months(member)` is non-empty:
  any closed month from the start month onward (never the current month, MEMBER
  role only) with **no CONFIRMED** submission — MISSING / PENDING / REJECTED all
  block (strict). Members clear a month via `submit_material_submission(…, p_period_month)`;
  it stays PENDING until a Super Admin confirms it. `my_submission_debt()` backs
  the member-facing block on `/orders/new`, `/submissions` and the dashboard.
  Do not add grace periods, auto-approval, or per-material owed logic without
  agreeing it first.
- `items.stock_type` (Phase 18) splits the `items` table: `CATALOGUE` is the
  member-facing shop (priced, may be `orderable`); `RAW_MATERIAL` / `TOOL` /
  `SEIZED` / `OTHER` are the **company stash** only. Non-catalogue items are
  Super-Admin-only (RLS), force `orderable=false` + `price=0` (constraint + RPC),
  and never reach `create_order`. `/admin/items` shows CATALOGUE only;
  `/admin/inventory` ("Company stash") shows every type and can create any of
  them. Items carry an optional `image_url` thumbnail (`item-images` bucket).
- Do not build the remaining future modules (member inventory requests, the
  production→inventory movement hookup) — the schema leaves room; the app does
  not implement them.
- Run `npm run validate` before committing. Implement one phase at a time.

## Typography note (deviation from global standard)

Global standards discourage Inter as a display font. This project uses Inter for
both body and headings because the PRD explicitly requests it and it matches the
Untitled UI baseline. `--font-display` is a separate token in `globals.css` so a
distinct heading face can be swapped in without refactoring.
