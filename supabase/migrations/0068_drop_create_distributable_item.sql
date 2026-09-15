-- ============================================================================
-- 0068_drop_create_distributable_item
-- Company cut no longer creates items. Typing a name there produced a second
-- stash item whenever one already existed under a slightly different name —
-- item names are not unique, and the cut links by item_id, so the duplicate
-- silently split the stock: the cut sat on one row while the quantity sat on
-- the other.
--
-- Items are now created in exactly one place (/admin/inventory), and Company
-- cut only ever attaches a rate to an item that already exists, via
-- set_distribution_rate. This drops the create-and-price shortcut from 0064.
-- ============================================================================

drop function if exists public.create_distributable_item(
  text, public.item_unit, numeric, public.stock_type
);
