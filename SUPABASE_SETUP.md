# Supabase setup runbook

Connect this app to a hosted Supabase project, apply the schema, seed
development data, and log in. ~10 minutes. Do this once.

There is **no local database** in this project (no Docker). Everything targets a
hosted Supabase project.

---

## 0. Prerequisites

- Repo cloned, `npm install` run, Node ≥ 20 (`node -v`).
- A free account at <https://supabase.com>.
- These commands are run from the repo root.

---

## 1. Create the Supabase project

1. <https://supabase.com/dashboard> → **New project**.
2. Fill in:
   - **Name** — anything, e.g. `crimson-creed`.
   - **Database Password** — generate one and **save it somewhere**. You need it
     in step 3 for `supabase link`.
   - **Region** — closest to you.
   - Plan: **Free** is fine.
3. Click **Create new project** and wait ~2 minutes for it to finish
   provisioning.

---

## 2. Collect the three keys

Dashboard → your project → **Settings** (gear) → **API**.

| Copy this                                            | Into env var                    |
| ---------------------------------------------------- | ------------------------------- |
| **Project URL** (e.g. `https://abcdxyz.supabase.co`) | `NEXT_PUBLIC_SUPABASE_URL`      |
| **`anon` / `public`** key (Project API keys)         | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **`service_role` / `secret`** key — click _Reveal_   | `SUPABASE_SERVICE_ROLE_KEY`     |

> If the dashboard shows a **"Legacy API keys"** tab, use the keys there
> (`anon` and `service_role`). Both the legacy JWT keys and the newer
> publishable/secret keys work with this app.

Your **project ref** is the subdomain of the Project URL — from
`https://abcdxyz.supabase.co` the ref is `abcdxyz`. You need it in step 3.

> ⚠️ The `service_role` key bypasses all security. Never paste it into client
> code or commit it. It only goes in `.env.local` (git-ignored) and is used
> server-side for creating member accounts / resetting passwords / seeding.

---

## 3. Fill in `.env.local`

There is already a `.env.local` at the repo root with placeholder values.
Replace its contents with your real values:

```dotenv
NEXT_PUBLIC_SUPABASE_URL="https://abcdxyz.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon / public key>"
SUPABASE_SERVICE_ROLE_KEY="<service_role / secret key>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

`.env.local` is git-ignored — do not commit it.

---

## 4. Apply the database schema

There are **16 ordered migrations** in `supabase/migrations/` (`0001` … `0016`).
Pick **one** of the two methods below. Don't mix them.

### Method A — Supabase CLI (recommended)

The CLI is already a dev dependency; run it with `npx supabase`.

```bash
# 4A.1  Authenticate the CLI with your Supabase account.
#       Opens a browser. (Headless? create a token at
#       https://supabase.com/dashboard/account/tokens and instead run:
#       export SUPABASE_ACCESS_TOKEN=sbp_xxx    — PowerShell: $env:SUPABASE_ACCESS_TOKEN="sbp_xxx")
npx supabase login

# 4A.2  Link this repo to your project. Enter the DB password from step 1
#       when prompted (or pass it: --password "<db password>").
npx supabase link --project-ref <your-ref>

# 4A.3  Push all migrations. It prints the list of 16 files and asks to
#       confirm — type "y".
npx supabase db push
```

Expected: `Applying migration 0001_init_helpers.sql...` … through
`0016_settings_rpc.sql`, ending with `Finished supabase db push.`

Optional — regenerate the typed schema (the committed
`src/lib/database.types.ts` already matches the migrations, so this is only
needed if you later change a migration):

```bash
npm run db:types
```

### Method B — SQL Editor (no CLI)

Dashboard → **SQL Editor** → **New query**. Open each file in
`supabase/migrations/` **in numeric order** and run them one at a time:

```
0001_init_helpers.sql
0002_enums.sql
0003_members.sql
0004_items.sql
0005_orders.sql
0006_order_items.sql
0007_inventory.sql
0008_notifications.sql
0009_order_timeline.sql
0010_activity_audit.sql
0011_settings.sql
0012_auth_helpers.sql
0013_rpc.sql
0014_rls.sql
0015_item_rpc.sql
0016_settings_rpc.sql
```

Each should report **Success**. If one fails, stop and fix before continuing —
they depend on each other. (With this method you skip `npm run db:types`; the
committed types file is correct.)

---

## 5. Seed development data

This creates ~15 fictional member accounts (through the Supabase Auth admin
API), ~17 catalogue items, opening stock, and a spread of orders across every
status. **It wipes existing seeded data first** — only run it against a throwaway
dev project.

```bash
npm run db:seed
```

At the end it prints a credentials table. Keep it. The important ones:

| Login                           | Password           | Role                                             |
| ------------------------------- | ------------------ | ------------------------------------------------ |
| `vincent_crane@crimson.local`   | `Crimson#vincent1` | Super Admin                                      |
| `marlow_dietrich@crimson.local` | `Crimson#marlow1`  | Super Admin                                      |
| `sable_ruiz@crimson.local`      | `Crimson#sable1`   | Member                                           |
| `hugo_marsh@crimson.local`      | `Crimson#hugo1`    | Member — **inactive** (login blocked on purpose) |

Password pattern for the rest: `Crimson#<first-name>1`.

---

## 6. Run the app

```bash
npm run dev
```

Open <http://localhost:3000>, sign in as `vincent_crane@crimson.local` /
`Crimson#vincent1`.

---

## 7. Smoke check

- **Admin dashboard** shows non-zero KPIs and a "needs attention" list.
- **Orders** (`/admin/orders`) has ~30–50 rows with mixed statuses.
- Sign out, sign in as `sable_ruiz@crimson.local` / `Crimson#sable1`:
  - **New order** → add an item, place it → lands on the order page as
    `PENDING` / `Unpaid`.
  - Click **I've paid**.
- Sign back in as the admin, open that order, run
  **Verify payment → Start processing → Record distribution → Complete**.
- Try signing in as `hugo_marsh@crimson.local` — should be refused
  ("account is inactive").

The Playwright spec `e2e/acceptance.spec.ts` automates this exact flow — see
`e2e/README.md`.

---

## Troubleshooting

| Symptom                                                                       | Fix                                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `supabase login` / `db push`: "You must be logged in"                         | Run `npx supabase login`, or set `SUPABASE_ACCESS_TOKEN` (see step 4A.1).                                             |
| `db push`: connection timeout / IPv6 errors                                   | Your network can't reach the direct DB port. Use **Method B** (SQL Editor).                                           |
| `db push`: wrong password                                                     | Reset it: Dashboard → Settings → Database → **Reset database password**, then re-run `link`.                          |
| App: RPC calls 404 / "Could not find function"                                | PostgREST schema cache is stale. Dashboard → Settings → API → **Reload schema**, or wait ~60s.                        |
| `npm run db:seed`: "Missing env…"                                             | `.env.local` isn't at the repo root, or a key is blank.                                                               |
| `npm run db:seed`: "User already registered" / partial data                   | Re-run `npm run db:seed` (it wipes first). Or delete all users under Dashboard → Authentication → Users, then re-run. |
| Login: "That email and password did not match"                                | Seed didn't run, or wrong password (pattern is `Crimson#<first-name>1`).                                              |
| Login succeeds then bounces to `/login?error=inactive`                        | You used `hugo_marsh` — that account is inactive by design.                                                           |
| `src/lib/database.types.ts` looks garbled after `npm run db:types` on Windows | `git checkout -- src/lib/database.types.ts` — the committed file already matches the migrations.                      |
| `npm run dev` fails at startup with an env/zod error                          | A `NEXT_PUBLIC_SUPABASE_*` value in `.env.local` is missing or isn't an `http(s)` URL.                                |

---

## Notes for whoever runs this

- **Auth is 100% Supabase.** There is no mock/bypass login. No project → no login.
- Do **not** commit `.env.local`. Do **not** put `SUPABASE_SERVICE_ROLE_KEY`
  anywhere a browser can see it (it's only imported by `src/lib/supabase/admin.ts`,
  which is server-only).
- Email confirmations don't matter here — seeded and admin-created users are
  created pre-confirmed via the admin API.
- Row Level Security is enabled on every table; the app connects as the
  signed-in user and RLS is the real authorization boundary. The service-role
  path is only for member provisioning / password resets / the seed.
- `supabase/config.toml` is for the local CLI stack (unused here) — leave it.
