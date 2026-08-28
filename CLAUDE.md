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
- Every list has an intentional empty state; every async view has skeletons;
  errors are non-technical. Dangerous actions use a confirm dialog.
- Do not build future modules (production, wages, FiveM, member inventory
  requests) — the schema leaves room for them; the app does not implement them.
- Run `npm run validate` before committing. Implement one phase at a time.

## Typography note (deviation from global standard)

Global standards discourage Inter as a display font. This project uses Inter for
both body and headings because the PRD explicitly requests it and it matches the
Untitled UI baseline. `--font-display` is a separate token in `globals.css` so a
distinct heading face can be swapped in without refactoring.
