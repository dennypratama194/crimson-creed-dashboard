-- ============================================================================
-- 0077_reassert_drop_create_distributable_item
-- Makes 0068's end state reachable by a database that never ran 0068.
--
-- 0068 fills a numbering gap below 0069–0073, which reached main before it
-- did. The production catch-up script recorded 0068 as applied, so the file
-- stays exactly where it is — renaming or deleting a migration a database has
-- recorded makes `supabase db push` refuse the whole history. But a database
-- that reached 0073 from main alone would skip 0068 (the CLI does not run an
-- out-of-order version without --include-all) and keep the create-and-price
-- shortcut that 0068 exists to remove.
--
-- Re-issuing the same idempotent drop here, at the end of the sequence, gives
-- every database the same function set whichever way it arrived. Additive in
-- effect: on a database that already ran 0068 this is a no-op.
-- ============================================================================

drop function if exists public.create_distributable_item(
  text, public.item_unit, numeric, public.stock_type
);
