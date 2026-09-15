-- ============================================================================
-- 0072_delete_item
-- A genuine hard delete for items, mirroring how member deletion already works:
-- the row is removed only when nothing references it, otherwise the call is
-- refused and the caller is told to archive instead.
--
-- Every FK into `items` is `on delete restrict`, so an unguarded delete would
-- fail with a raw constraint error; this checks each referencing table up front
-- and names what is blocking. `inventory` is the exception — the trigger in
-- 0007 creates exactly one row per item, so it is deleted alongside rather than
-- counted as a reference. Stock cannot be non-zero without a movement, and a
-- movement blocks the delete, so nothing is silently discarded.
--
-- Atomic: the inventory row and the item go in one transaction.
-- ============================================================================

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
  v_n        integer;
begin
  perform app.require_super_admin();

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;

  select count(*) into v_n from order_items where item_id = p_item_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s order line(s)', v_n); end if;

  select count(*) into v_n from inventory_movements where item_id = p_item_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s stock movement(s)', v_n); end if;

  select count(*) into v_n from distributions where item_id = p_item_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s draw(s)', v_n); end if;

  select count(*) into v_n from production_assignments where item_id = p_item_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s production assignment(s)', v_n); end if;

  select count(*) into v_n from production_logs where item_id = p_item_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s production log(s)', v_n); end if;

  select count(*) into v_n from supplier_items where item_id = p_item_id;
  if v_n > 0 then v_blockers := v_blockers || format('%s supplier listing(s)', v_n); end if;

  select count(*) into v_n
  from submission_material_types where inventory_item_id = p_item_id;
  if v_n > 0 then v_blockers := v_blockers || 'a monthly submission material'; end if;

  if array_length(v_blockers, 1) is not null then
    raise exception '"%" has % and cannot be deleted. Archive it instead — its history stays intact.',
      v_item.name, array_to_string(v_blockers, ', ')
      using errcode = 'foreign_key_violation';
  end if;

  -- Audit BEFORE the delete: audit_logs.entity_id is not an FK, but the row
  -- has to be readable to snapshot it.
  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values)
  values (v_actor, 'ITEM_DELETED', 'item', v_item.id, to_jsonb(v_item));

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'item.deleted', format('Deleted item "%s"', v_item.name),
          'ITEM', v_item.id);

  -- Unreferenced cuts and the auto-created inventory row go with it.
  delete from distribution_rates where item_id = p_item_id;
  delete from production_rates where item_id = p_item_id;
  delete from inventory where item_id = p_item_id;
  delete from items where id = p_item_id;
end;
$$;

revoke all on function public.delete_item(uuid) from public, anon;
grant execute on function public.delete_item(uuid) to authenticated, service_role;
