# Supabase Security Advisor — review & remediation (2026-09-08)

Project: **Crimson Creed** (`crimson-creed-prod`). Advisor state at review:
**0 errors · 50 warnings · 1 info.**

The 51 findings collapse to five distinct issues. Summary of what was done and
why; detail per issue below.

| #   | Issue                                                       | Findings | Action                                     | Status                            |
| --- | ----------------------------------------------------------- | -------: | ------------------------------------------ | --------------------------------- |
| 1   | Function Search Path Mutable (`app.*`)                      |        7 | Migration `0052` pins `search_path`        | **Done — pending apply**          |
| 2   | Signed-in users can execute `SECURITY DEFINER` (`public.*`) |       41 | Audited every function; all self-authorize | **Audited — dismiss with reason** |
| 3   | Leaked Password Protection Disabled (Auth)                  |        1 | Enable HaveIBeenPwned check in dashboard   | **Dashboard toggle — owner**      |
| 4   | RLS Enabled No Policy (`public.auth_throttle`)              | 1 (info) | Intentional deny-all; no change            | **Dismiss with reason**           |
| 5   | Public Bucket Allows Listing (`storage.item-images`)        |        1 | Deferred — non-sensitive thumbnails        | **Deferred**                      |

---

## 1. Function Search Path Mutable — FIXED in migration 0052

Seven helpers in the `app` schema were created before the project rule that
every function pins `SET search_path`. Every RPC from migration `0012` onward
already carries `set search_path = public, pg_temp`; these predate it:

| Function                                     | Kind                                      | Origin |
| -------------------------------------------- | ----------------------------------------- | ------ |
| `app.set_updated_at()`                       | trigger (fires on ~15 tables)             | 0001   |
| `app.reject_mutation()`                      | trigger (append-only tables)              | 0001   |
| `app.forbid_delete()`                        | trigger (no-delete tables)                | 0011   |
| `app.guard_notification_update()`            | trigger (notifications)                   | 0008   |
| `app.cash_category_direction(cash_category)` | pure SQL, `immutable`                     | 0025   |
| `app.submission_line_qty(jsonb, uuid)`       | pure SQL, `immutable`                     | 0034   |
| `app.require_super_admin()`                  | authz gate (calls `app.is_super_admin()`) | 0013   |

**Risk addressed:** search-path shadowing of a `SECURITY DEFINER`/trigger
function. Low exploitability here (`authenticated` has no `CREATE` on `public`
in Supabase), so this is defence-in-depth + consistency, not an open hole.

**Fix:** `supabase/migrations/0052_pin_function_search_path.sql` — `ALTER
FUNCTION ... SET search_path = public, pg_temp` for all seven. No body is
re-declared, so there is no behavioural change. `ALTER FUNCTION ... SET` is
idempotent; the block is also mirrored into `pending-migrations.sql`.

**Verification after apply:** `npm run validate`, then exercise one write per
trigger path — order `UPDATE` (`set_updated_at`), cash entry
(`cash_category_direction`), material submission (`submission_line_qty`),
notification read (`guard_notification_update`), any Super-Admin action
(`require_super_admin`). Re-run the advisor; these 7 rows clear.

---

## 2. Signed-in users can execute SECURITY DEFINER — AUDITED, dismiss with reason

The advisor flags all 41 `public.*` `SECURITY DEFINER` RPCs because `authenticated`
holds `EXECUTE`. This is the intended architecture (per `CLAUDE.md`): RPCs are
invoked as the signed-in user through the SSR client, need definer rights for
atomic multi-table writes, and must live in `public` to be reachable via
`.rpc()`. The advisor's three suggestions (revoke EXECUTE / switch to INVOKER /
move out of `public`) each break that model. The class is therefore
_accept + dismiss_ — **conditional on every function self-authorizing.**

### Audit result — PASS

Every `public.*` `SECURITY DEFINER` function follows one of two patterns:

- **Admin operations** — first executable statement is `perform
app.require_super_admin()` (raises `insufficient_privilege` for non-admins).
- **Member operations** — resolve the member from `auth.uid()` /
  `app.current_member_id()` and check row ownership before mutating.

**No function trusts a client-supplied identity or money field.** Spot-checks on
the highest-risk functions (those taking price / rate / quantity / member args):

| Function                                                                                                                                                  | Guard                                                                              | Money/identity handling                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `create_order(jsonb, text)`                                                                                                                               | member from `auth.uid()` + owed-months gate                                        | price read from `items.price` and snapshotted; line/total computed in-loop server-side; client `quantity` validated `> 0` integer |
| `submit_production_log(uuid, numeric, …)`                                                                                                                 | member from `auth.uid()`                                                           | rate read from `production_rates`; `payout = round(quantity × rate, 2)` server-side; quantity bounded `0 < q ≤ 1e6`               |
| `set_production_rate(uuid, numeric)`                                                                                                                      | `require_super_admin()`                                                            | rate is the legitimate admin input; `< 0` rejected                                                                                |
| `review_production_log(uuid, boolean, text)`                                                                                                              | `require_super_admin()`                                                            | status transition only; reject requires a reason                                                                                  |
| `set_supplier_item(uuid, uuid, numeric, numeric, integer, boolean)`                                                                                       | `require_super_admin()`                                                            | prices are admin input; negatives rejected; `sell_price` never feeds order totals                                                 |
| `record_cash_entry(cash_direction, numeric, cash_category, …, uuid)`                                                                                      | `require_super_admin()`                                                            | amount bounded; `handled_by` must resolve to a `SUPER_ADMIN` member                                                               |
| `reverse_cash_entry(uuid, text)`                                                                                                                          | `require_super_admin()`                                                            | posts the exact opposite of the named entry; double-reversal blocked                                                              |
| `confirm_member_submission(uuid, jsonb, text)`                                                                                                            | `require_super_admin()`                                                            | quantities are the admin's verified counts; posts _signed delta_ vs already-posted, never a direct `current_quantity` edit        |
| `submit_material_submission(jsonb, text, date)`                                                                                                           | member from `auth.uid()`                                                           | target month validated server-side against `app.member_owed_months`; future month rejected                                        |
| `update_item(uuid, …, stock_type)`                                                                                                                        | `require_super_admin()`                                                            | non-catalogue items forced `orderable=false`, `price=0`                                                                           |
| `update_relation(uuid, …, boolean)`                                                                                                                       | `require_super_admin()`                                                            | `metal_scrap_settled` toggle posts a fixed ±250 movement via `app.apply_relation_metal_scrap`                                     |
| order lifecycle (`start_order_processing`, `record_order_distribution`, `complete_order`, `reject_order`, `verify_order_payment`, `reject_order_payment`) | `require_super_admin()`                                                            | status/stock transitions only                                                                                                     |
| `submit_order_payment(uuid)`, `cancel_order(uuid, text)`, `cancel_production_log(uuid)`                                                                   | ownership check (`member_id` vs `current_member_id()`); admins allowed a wider set | no client money/identity trusted                                                                                                  |

Member CRUD and password reset are **not** RPCs — they run through the
service-role client in server actions behind a TS `assertSuperAdmin()` and are
not exposed to `authenticated` at all.

### Action

In the advisor, dismiss each row in this class with the reason:

> Definer by design; authorization enforced in-function via
> `app.require_super_admin()` / `app.current_member_id()` ownership check. No
> client-supplied identity, price, rate or quantity is trusted. Audited
> 2026-09-08 (see docs/security-advisor-2026-09.md).

Dismiss **per function**, not as a blanket rule mute — so a future RPC added
without a guard surfaces as one new row.

---

## 3. Leaked Password Protection Disabled — enable in dashboard

Supabase can reject new/changed passwords found in the HaveIBeenPwned breach
corpus. Currently off.

- **Value here:** limited — passwords are Super-Admin-set with synthesised
  emails — but members who change their own password could still pick a breached
  one.
- **Cost:** one toggle, no code, no migration, zero risk.
- **Do:** Dashboard → **Authentication → Sign In / Providers → Password
  settings** → enable **"Check against HaveIBeenPwned"**. While there, confirm
  **minimum password length ≥ 8**.

---

## 4. RLS Enabled No Policy (`public.auth_throttle`) — no change, dismiss

The info suggestion flags `auth_throttle` as having RLS enabled with no policies.
This is **deliberate** and documented in `0022_auth_throttle.sql`:

```
alter table auth_throttle enable row level security;
-- Intentionally no policies: only `service_role` (bypasses RLS) and the
-- SECURITY DEFINER functions below ever touch this table.
revoke all on table auth_throttle from anon, authenticated;
```

RLS-on + zero-policy + `REVOKE ALL` is a deny-all: `anon` / `authenticated`
cannot read or write it via PostgREST; only `service_role` and
`hit_auth_throttle` / `clear_auth_throttle` (both `SECURITY DEFINER`) touch it.
The advisor cannot distinguish "no policy" from "no policy on purpose".

**Action:** dismiss with the reason:

> Deny-all by design (migration 0022). Table is written only by the
> `hit_auth_throttle` / `clear_auth_throttle` SECURITY DEFINER helpers and read
> only by `service_role`. No policy is wanted.

---

## 5. Public Bucket Allows Listing (`storage.item-images`) — deferred

The `item-images` bucket is public so `<img>` thumbnails load without signed
URLs. Its `SELECT` policy (`0017_item_images.sql`) is
`using (bucket_id = 'item-images')`, which also satisfies `list` — anyone can
enumerate every file.

- **Leaked:** item count, upload timestamps, filename patterns, orphaned images.
  **Not** leaked: anything sensitive — these are item photos.
- **Why deferred:** the low-risk fix (tighten the `SELECT` policy so it no longer
  satisfies `list`) needs a check that nothing in the app lists the bucket
  (`src/components/patterns/image-upload-field.tsx`); the thorough fix (private
  bucket + signed URLs / proxy route) is real work and a new failure mode. Not
  worth it for non-sensitive thumbnails.
- **Revisit if:** filenames ever start encoding sensitive data.

---

## Sequencing

`pending-migrations.sql` bundles `0046 → 0052` for a one-shot run in the
Supabase SQL editor and syncs `supabase_migrations.schema_migrations`. Apply
that file, then re-run the advisor and dismiss issues 2 and 4 with the reasons
above, and toggle issue 3.
