## What changed, and why

<!-- One or two sentences. The why matters more than the what. -->

## Evidence

Paste results, don't just tick. A skipped check is a **skip**, not a pass.

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run test`
- [ ] `npm run db:test`
- [ ] `npm run check:migrations`
- [ ] `npm run build`

Needs infrastructure — state ran / skipped and why:

- [ ] `npm run db:test:concurrency` (`TEST_DATABASE_URL`) — required if this
      touches locking or shared-state writes
- [ ] `npm run test:e2e` (seeded throwaway project) — required if this changes a
      workflow the acceptance spec walks

## Database

Skip this section if no migration.

- New migration files:
- Objects added / replaced:
- [ ] No historical migration was edited, renamed or deleted
- [ ] Numbered after the current highest — not filling a gap
- [ ] New RPCs `revoke` from `public, anon` and `grant execute` to
      `authenticated, service_role`
- [ ] `set search_path = public, pg_temp` on every new or replaced function,
      triggers included
- [ ] Authorization enforced **in the RPC**, not only in the UI
- [ ] The currently deployed app still works against this schema
- [ ] Locking / migration duration considered
- Recovery if this goes wrong (app rollback alone, or a database restore?):

## Behaviour

- [ ] Ownership, failure, empty, loading and pagination states all checked
- [ ] Caches and routes invalidated by every mutation (incl.
      `ORDERABLE_ITEMS_CACHE_TAG` for item writes)
- [ ] Existing workflow tests updated to match any UI change — not weakened
- [ ] Repeated / double-submitted requests considered

## Risk

- [ ] No business rule changed to simplify the implementation
- [ ] No dormant module (piece-rate / payroll) dropped or built on
- [ ] Nothing was run against production

<!-- Anything the reviewer should look at hardest: -->
