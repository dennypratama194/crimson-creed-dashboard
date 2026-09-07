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

## Every time you add a feature that needs the database

Data never clashes between the two projects, but **schema does** — production
running new code against an old schema will break. So:

1. Write the migration(s) in `supabase/migrations/`.
2. Apply to **dev** and build against dummy data:
   ```bash
   npx supabase link --project-ref <DEV-REF>
   npx supabase db push
   npm run db:types          # regenerate src/lib/database.types.ts
   ```
   (This repo also hand-maintains `database.types.ts` to match the migrations —
   keep the two in agreement.)
3. `npm run validate` — the schema smoke test (`db:test`) applies every migration
   against an in-process Postgres, so a broken migration fails here.
4. Before (or with) the deploy that needs it, apply the **same** migrations to
   production:
   ```bash
   npx supabase link --project-ref <PROD-REF>
   npx supabase migration list   # shows local vs remote — confirm what's pending
   npx supabase db push
   npx supabase link --project-ref <DEV-REF>   # link back to dev
   ```

`npm run db:migrations` is a shortcut for `supabase migration list` against the
currently-linked project.

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
