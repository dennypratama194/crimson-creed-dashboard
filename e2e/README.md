# End-to-end tests

`acceptance.spec.ts` is the PRD §38 acceptance test: a full order lifecycle
(member places → admin verifies payment → processing → distribution →
completion) plus a member/admin authorization check.

## Prerequisites

These run against a **real Supabase project** (there is no local Docker stack
in this environment):

```bash
cp .env.example .env.local          # fill in the three Supabase keys
npx supabase link --project-ref <ref>
npm run db:push
npm run db:seed                     # creates the fixture users below
```

The seed prints every account's credentials. The spec uses:

| Role   | Email                       | Password         |
| ------ | --------------------------- | ---------------- |
| Admin  | vincent_crane@crimson.local | Crimson#vincent1 |
| Member | sable_ruiz@crimson.local    | Crimson#sable1   |

## Run

```bash
npx playwright install    # first time only
npm run test:e2e
```

The Playwright config starts `npm run dev` automatically and points at
`NEXT_PUBLIC_APP_URL` (default http://localhost:3000).

CI does not run these (no Supabase project in CI).
