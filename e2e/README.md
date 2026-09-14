# End-to-end tests

| Spec                 | Covers                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `acceptance.spec.ts` | Full order lifecycle (member places → admin verifies payment → processing → distribution → completion); a member cannot reach admin routes |
| `access.spec.ts`     | A signed-out visitor is redirected to `/login` with `?next=`; an inactive member cannot sign in                                            |

Cash ledger, production approval, payroll finalization and monthly submission
flows are **not** covered end-to-end yet. Their authorization and business rules
are covered by `npm run db:test` (PGlite) and the server-action tests in
`npm run test`, neither of which needs a hosted project.

## Prerequisites — a hosted, throwaway Supabase project

Every spec here signs in through real Supabase Auth, so it needs a **hosted
development project** with migrations applied and seed data loaded. There is no
local Docker stack. **Never point these at production** — `db:seed` wipes data.

```bash
cp .env.example .env.local          # dev project keys, SUPABASE_ENV="development"
npx supabase link --project-ref <DEV-REF>
npm run db:push
npm run db:seed                     # creates the fixture users below
```

The seed prints every account. The specs use:

| Role              | Username        | Password           |
| ----------------- | --------------- | ------------------ |
| Super Admin       | `vincent_crane` | `Crimson#vincent1` |
| Member            | `sable_ruiz`    | `Crimson#sable1`   |
| Member — inactive | `hugo_marsh`    | `Crimson#hugo1`    |

The acceptance spec creates a new order each run, so re-seed occasionally.

## Run

```bash
npx playwright install    # first time only
npm run test:e2e
```

The Playwright config starts `npm run dev` automatically and points at
`NEXT_PUBLIC_APP_URL` (default http://localhost:3000).

## CI

CI does **not** run these. The normal CI job runs typecheck, lint, Prettier,
Vitest, the PGlite database suite and the build — none of which need Supabase.
A separate E2E workflow should only be added once an isolated, seedable test
project exists; it would need its URL, anon key and service-role key as
repository secrets, run `db:push` + `db:seed` against that project, and then
`npm run test:e2e`.
