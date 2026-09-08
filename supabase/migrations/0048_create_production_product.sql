-- ============================================================================
-- 0048_create_production_product
-- A "production product" is a PRODUCT-category catalogue item plus a pay rate.
-- The admin action created the two in separate RPC calls, so a failure on the
-- second left an orphan zero-rate item behind. This wraps both in one
-- SECURITY DEFINER function → one transaction: if the rate insert fails, the
-- item creation rolls back with it.
--
-- Delegates to the existing create_item / set_production_rate RPCs (each still
-- re-checks Super Admin and writes its own audit + activity rows).
-- ============================================================================

create or replace function public.create_production_product(
  p_name      text,
  p_unit      item_unit,
  p_unit_rate numeric
)
returns production_rates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item items;
  v_rate production_rates;
begin
  perform app.require_super_admin();

  -- Not orderable, zero price, catalogue stock type — the Items page manages
  -- those later if the org also sells it.
  v_item := public.create_item(
    p_name, 'PRODUCT'::item_category, p_unit, 0,
    null, null, 0, false, true, null, 'CATALOGUE'::stock_type
  );

  v_rate := public.set_production_rate(v_item.id, p_unit_rate);

  return v_rate;
end;
$$;

revoke all on function public.create_production_product(text, item_unit, numeric)
  from public, anon;
grant execute on function public.create_production_product(text, item_unit, numeric)
  to authenticated, service_role;
