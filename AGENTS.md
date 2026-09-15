<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Crimson Creed — project instructions

Production system. Read before changing anything.

- **Engineering standards — business invariants, database, concurrency,
  performance, application structure, testing, deployment and recovery:**
  [`docs/engineering-standards.md`](docs/engineering-standards.md)
- **Environment separation and the deploy runbook:**
  [`DEPLOYMENT.md`](DEPLOYMENT.md)
- **Module-by-module domain detail and phase history:**
  [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), and the PRD
  (`Crimson_Creed_Operations_System_PRD.pdf`), which is the source of truth for
  the product itself.

Those are the source of truth. This file lists only what is short enough to be
worth repeating.

References run one way — `CLAUDE.md` imports this file, this file points at
`docs/`. Do not add a link from here back to `CLAUDE.md`; that would make a
cycle out of a chain.

## The short version

- **The database is the enforcement point.** Hiding a control in the UI is not
  authorization. Every rule must hold for a direct RPC call.
- **Migrations are forward-only.** Never edit, rename or delete one that is
  already on the base branch; add a new one at the end of the sequence.
  `npm run check:migrations` enforces it.
- **Pin `set search_path = public, pg_temp`** on every function in `public` and
  `app`, triggers included.
- **Parent before child.** Lock the parent row first, re-read the child under
  that lock, recompute rollups while still holding it. See
  `supabase/migrations/0074_assignment_lock_order.sql`.
- **Totals and snapshots are server-side.** Never trust a price, total,
  quantity, `member_id` or role from the browser.
- **`src/lib/database.types.ts` is generated output.** Hand-authored RPC payload
  contracts live in `src/lib/db/contracts.ts`.
- **Never run `db:push`, `db:seed`, or anything in `supabase/.temp/` against
  production.** `pending-migrations.sql` at the repo root is superseded and must
  not be run at all.
- **Do not commit** unless asked.

## Required checks

```bash
npm run validate          # typecheck + lint + test + db:test
npm run format:check
npm run build             # needs placeholder Supabase env vars, see .github/workflows/ci.yml
npm run check:migrations  # forward-only migration guard
npm run check:deadcode    # knip, advisory — read it, don't obey it blindly
```

Two more need infrastructure that is not assumed to exist locally. A skipped run
is a **skip**, not a pass — say so:

```bash
TEST_DATABASE_URL=postgres://…/crimson_test npm run db:test:concurrency
npm run test:e2e          # needs a seeded throwaway Supabase project
```
