-- ============================================================================
-- 0070_cuts_product_only
-- Owner decision: only PRODUCT-category items can carry a company cut.
--
-- This replaces the stock-type rule entirely. 0061 keyed on `stock_type`
-- (stash only), 0069 dropped that check; the eligibility test is now
-- `items.category = 'PRODUCT'`, which is the same rule the production
-- assignment picker uses. Stock type is irrelevant here — a PRODUCT item may
-- be catalogue or stash and is drawable either way.
--
-- Enforced in the RPC, not just the picker: the UI only hides controls.
-- Existing cuts on non-PRODUCT items are left alone; this gates new writes.
-- ============================================================================

create or replace function public.set_distribution_rate(
  p_item_id uuid,
  p_unit_rate numeric
)
returns distribution_rates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_item  items;
  v_old   distribution_rates;
  v_rate  distribution_rates;
begin
  perform app.require_super_admin();

  if p_unit_rate is null or p_unit_rate < 0 then
    raise exception 'A rate of zero or more is required' using errcode = 'check_violation';
  end if;
  if p_unit_rate > 100000000 then
    raise exception 'That rate is too large' using errcode = 'check_violation';
  end if;

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_item.archived_at is not null then
    raise exception 'Restore this item before setting a rate' using errcode = 'check_violation';
  end if;
  if v_item.category <> 'PRODUCT' then
    raise exception 'Only Product items can carry a company cut. Change this item''s category first.'
      using errcode = 'check_violation';
  end if;

  select * into v_old from distribution_rates where item_id = p_item_id;

  insert into distribution_rates (item_id, unit_rate, updated_by)
  values (p_item_id, p_unit_rate, v_actor)
  on conflict (item_id) do update
    set unit_rate = excluded.unit_rate,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_rate;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'distribution.rate_set',
    case when v_old.item_id is not null and v_old.unit_rate <> v_rate.unit_rate
         then format('Company cut for "%s" %s → %s per %s',
                     v_item.name, v_old.unit_rate, v_rate.unit_rate, lower(v_item.unit::text))
         else format('Company cut for "%s" set to %s per %s',
                     v_item.name, v_rate.unit_rate, lower(v_item.unit::text)) end,
    'ITEM', p_item_id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (
    v_actor, 'DISTRIBUTION_RATE_SET', 'item', p_item_id,
    case when v_old.item_id is not null then jsonb_build_object('unit_rate', v_old.unit_rate) end,
    jsonb_build_object('unit_rate', v_rate.unit_rate)
  );

  return v_rate;
end;
$$;

comment on table distribution_rates is
  'Existence of a row marks an item as drawable. unit_rate is what the member owes the company per unit, not what they sell it for. Only PRODUCT-category items may carry a cut (0070); stock type is irrelevant.';
