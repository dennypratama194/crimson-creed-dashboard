# Crimson Creed Operations System

Private internal operations platform for a single FiveM / GTA V roleplay
organization. Operational record-keeping only — **no real-world transactions or
real-money payments**. The "payment" workflow records verification of fictional
in-game currency.

See `Crimson_Creed_Operations_System_PRD.pdf` for the full V1 specification. It is
the source of truth for scope, workflows, business rules, and data model.

## Stack

| Concern       | Choice                                                  |
| ------------- | ------------------------------------------------------- |
| Framework     | Next.js 16 (App Router, RSC, Server Actions), React 19  |
| Language      | TypeScript (strict, `noUncheckedIndexedAccess`)         |
| Styling       | Tailwind CSS v4 + CSS-variable design tokens            |
| UI primitives | Hand-authored Radix-based components (Untitled UI look) |
| Database      | Supabase — PostgreSQL, Auth, Row Level Security         |
| Server writes | Postgres RPC functions (atomic multi-table operations)  |
| Validation    | Zod (shared client + server)                            |
| Data (client) | TanStack Query + nuqs (URL-synced table state)          |
| Theme         | next-themes (light / dark / system)                     |
| Tests         | Vitest (unit), Playwright (E2E acceptance workflow)     |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev
```

### Supabase setup

There is no local Docker stack in this environment, so migrations target a hosted
project.

1. Create a project at https://supabase.com.
2. Put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Link and push migrations:
   ```bash
   npx supabase link --project-ref <ref>
   npm run db:push
   npm run db:types      # regenerates src/lib/database.types.ts
   npm run db:seed        # development seed data only
   ```

## Scripts

| Script              | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Dev server (Turbopack)                       |
| `npm run build`     | Production build                             |
| `npm run typecheck` | `tsc --noEmit`                               |
| `npm run lint`      | ESLint                                       |
| `npm run format`    | Prettier write                               |
| `npm run test`      | Vitest unit tests                            |
| `npm run test:e2e`  | Playwright E2E                               |
| `npm run validate`  | typecheck + lint + test (run before commits) |

## Project layout

```
src/
  app/                 routes (App Router), providers, root layout
  components/
    ui/                primitives (Button, Input, Badge, Table, Dialog, …)
    patterns/          composed patterns (PageHeader, DataTable, StatusBadge, …)
    <feature>/         feature components (orders/, members/, items/, …)
    providers/         client context providers
  lib/
    constants/         domain enums, labels, status tone + transition config
    supabase/          browser / server / proxy clients, admin client
    auth/              session + role guards
    db/                typed data-access functions
    services/          business logic / orchestration
    validation/        Zod schemas
    format/            money, date, id formatters
    database.types.ts  generated (do not edit)
supabase/
  migrations/          ordered SQL migrations
  seed.ts              development seed script
e2e/                   Playwright specs
```

## Roles

Two application roles only: `SUPER_ADMIN` and `MEMBER`. Organizational rank
(`BOSS`, `UNDER_BOSS`, `SECRETARY`, `B`, `SOLDIER`) is profile metadata and has
**no authorization effect** in V1. Authorization is enforced in the proxy, in
server actions, and in Postgres RLS — never in the UI alone.
