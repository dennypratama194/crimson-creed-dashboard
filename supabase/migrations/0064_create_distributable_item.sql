-- ============================================================================
-- 0064_create_distributable_item
-- Adding a drawable good used to mean two trips: create the item under Company
-- stash, then come back to Company cut and set its rate. This wraps both in one
-- SECURITY DEFINER function → one transaction: if the rate insert fails, the
-- item creation rolls back with it (same shape as 0048 did for production).
--
-- Delegates to the existing create_item / set_distribution_rate RPCs, each of
-- which still re-checks Super Admin and writes its own audit + activity rows.
--
-- CATALOGUE is refused here as well as in set_distribution_rate: a drawable
-- good must never also be orderable from the member-facing shop.
-- ============================================================================

create or replace function public.create_distributable_item(
  p_name       text,
  p_unit       item_unit,
  p_unit_rate  numeric,
  p_stock_type stock_type default 'RAW_MATERIAL'
)
returns distribution_rates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item items;
  v_rate distribution_rates;
begin
  perform app.require_super_admin();

  if p_stock_type = 'CATALOGUE' then
    raise exception 'A drawable item cannot be a catalogue item'
      using errcode = 'check_violation';
  end if;

  -- Not orderable, zero price — create_item forces both for a non-catalogue
  -- stock type anyway; passing them explicitly keeps the intent readable.
  v_item := public.create_item(
    p_name, 'PRODUCT'::item_category, p_unit, 0,
    null, null, 0, false, true, null, p_stock_type
  );

  v_rate := public.set_distribution_rate(v_item.id, p_unit_rate);

  return v_rate;
end;
$$;

revoke all on function
  public.create_distributable_item(text, item_unit, numeric, stock_type)
  from public, anon;
grant execute on function
  public.create_distributable_item(text, item_unit, numeric, stock_type)
  to authenticated, service_role;
