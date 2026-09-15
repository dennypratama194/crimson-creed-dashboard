-- ============================================================================
-- 0073_force_delete_item
-- Owner decision: Delete should actually delete, not refuse the moment an item
-- has any history at all. 0072 blocked on every reference, which in practice
-- meant anything ever stocked could only be archived.
--
-- delete_item now CLEARS the stash-side history itself and removes the item:
--   inventory_movements, inventory, distribution_rates, production_rates,
--   supplier_items, production_assignments (crew lines cascade) and the
--   dormant production_logs.
--
-- Two things still block it, because they are money, not stock history:
--   order_items   - a past order would lose lines and its total would stop
--                   matching what the member was charged. "Historical orders
--                   never change" is a PRD non-negotiable.
--   distributions - an open draw is a debt owed to the company; a settled one
--                   is the record that it was paid.
-- Plus submission_material_types, which is seeded config wiring the monthly
-- hand-in types to stock items — deleting it would break that module.
--
-- The refusal names which of the three is blocking, so the operator knows to
-- settle/reverse the draws (or archive instead) rather than guessing.
-- ============================================================================

-- ── narrow exemption to the append-only rule on inventory_movements ───────
-- The table stays append-only for every ordinary path: UPDATE is always
-- refused, and DELETE only passes while `app.purging_item` names the exact item
-- being deleted. delete_item sets that flag transaction-locally, so it cannot
-- leak to another statement, session, or item.
create or replace function app.reject_movement_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.purging_item', true), '') = old.item_id::text
  then
    return old;
  end if;

  raise exception 'Table %.% is append-only', tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

revoke all on function app.reject_movement_mutation()
  from public, anon, authenticated;

drop trigger if exists inventory_movements_no_change on inventory_movements;
create trigger inventory_movements_no_change
  before update or delete on inventory_movements
  for each row execute function app.reject_movement_mutation();

create or replace function public.delete_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_item     items;
  v_blockers text[] := '{}';
  v_cleared  jsonb;
  v_n        integer;
begin
  perform app.require_super_admin();

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;

  -- ── blockers: money, and seeded config ──────────────────────────────────
  select count(*) into v_n from order_items where item_id = p_item_id;
  if v_n > 0 then
    v_blockers := v_blockers || format('%s order line(s)', v_n);
  end if;

  select count(*) into v_n from distributions where item_id = p_item_id;
  if v_n > 0 then
    v_blockers := v_blockers || format('%s draw(s)', v_n);
  end if;

  select count(*) into v_n
  from submission_material_types where inventory_item_id = p_item_id;
  if v_n > 0 then
    v_blockers := v_blockers || 'a monthly submission material';
  end if;

  if array_length(v_blockers, 1) is not null then
    raise exception '"%" has % and cannot be deleted. Settle or reverse those first, or archive the item instead.',
      v_item.name, array_to_string(v_blockers, ', ')
      using errcode = 'foreign_key_violation';
  end if;

  -- ── what is about to be cleared, for the audit trail ────────────────────
  select jsonb_build_object(
    'stock_movements',
      (select count(*) from inventory_movements where item_id = p_item_id),
    'on_hand',
      coalesce((select current_quantity from inventory where item_id = p_item_id), 0),
    'production_assignments',
      (select count(*) from production_assignments where item_id = p_item_id),
    'production_logs',
      (select count(*) from production_logs where item_id = p_item_id),
    'supplier_listings',
      (select count(*) from supplier_items where item_id = p_item_id)
  )
  into v_cleared;

  -- Audit BEFORE the delete: the row has to be readable to snapshot it.
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'ITEM_DELETED', 'item', v_item.id, to_jsonb(v_item), v_cleared);

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'item.deleted',
    format('Deleted item "%s" and its stash history', v_item.name),
    'ITEM', v_item.id
  );

  -- ── clear the stash side, then the item ─────────────────────────────────
  delete from supplier_items where item_id = p_item_id;
  delete from distribution_rates where item_id = p_item_id;
  delete from production_rates where item_id = p_item_id;
  delete from production_logs where item_id = p_item_id;
  -- production_assignment_members is ON DELETE CASCADE from the assignment.
  delete from production_assignments where item_id = p_item_id;
  -- Transaction-local, and scoped to this item: the append-only trigger lets
  -- through exactly these rows and nothing else.
  perform set_config('app.purging_item', p_item_id::text, true);
  delete from inventory_movements where item_id = p_item_id;
  perform set_config('app.purging_item', '', true);

  delete from inventory where item_id = p_item_id;
  delete from items where id = p_item_id;
end;
$$;
