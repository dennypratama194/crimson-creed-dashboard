-- ============================================================================
-- 0076_item_delete_guard
-- Three fixes around the permanent item delete added in 0072/0073. The
-- owner-approved behaviour is unchanged: Delete still deletes, and still clears
-- the item's stash history. What changes is honesty, locking and one missing
-- function setting.
--
-- 1. THE REFUSAL MESSAGE WAS MISLEADING.
--    0073 blocks on `count(*) from distributions where item_id = ...` — every
--    draw, whatever its status — but told the operator to "settle or reverse
--    those first". Settling or reversing a draw leaves the row exactly where it
--    was, so following that advice never unblocks anything. The draw row IS the
--    record that the debt existed; it is meant to block for good. The message
--    now says so and points at Archive, which is the real answer. Order lines
--    and submission materials get their own sentence for the same reason.
--
-- 2. THE BLOCKER CHECK WAS NOT SERIALIZED AGAINST NEW REFERENCES.
--    The item row was read without a lock, so delete_item could count zero
--    order lines while create_order was mid-flight and about to write one.
--    delete_item now takes `select ... from items ... for update` FIRST, before
--    it counts anything.
--
--    That one lock is enough, and no other RPC needs changing: inserting an
--    order_items / distributions row takes an implicit FOR KEY SHARE lock on
--    the items row it references, which is exactly the share side of this.
--    So the two orderings both come out right:
--
--      order first  — delete_item's FOR UPDATE waits for the order to commit,
--                     then counts the new line and refuses by name.
--      delete first — the order's FK lock waits, then finds no item and the
--                     order rolls back whole (create_order is one transaction).
--
--    Lock order is always parent (items) then child (order_items,
--    distributions), on both paths, so there is no cycle to deadlock on.
--
-- 3. app.reject_movement_mutation() HAD NO PINNED search_path.
--    0052 pinned every `app` function that existed then; this one was added
--    later in 0073 and was missed. It is the trigger standing between an
--    ordinary caller and the append-only inventory ledger, and it resolves
--    `current_setting` and the error format against whatever search_path the
--    session has. ALTER FUNCTION ... SET only — the body is not re-declared.
--
-- Also adds item_delete_impact(), a Super-Admin-only preview so the
-- confirmation dialog can show what is about to be destroyed. It is ADVISORY
-- ONLY: delete_item re-counts every blocker itself, under the row lock, and
-- never reads a count supplied by the browser.
-- ============================================================================

-- ── 3. the missing setting ────────────────────────────────────────────────
alter function app.reject_movement_mutation()
  set search_path = public, pg_temp;

-- ── 1 + 2. delete_item ────────────────────────────────────────────────────
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

  if p_item_id is null then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;

  -- Lock the item BEFORE counting. Anything that wants to add a new reference
  -- (create_order, issue_distribution) takes a share lock on this same row, so
  -- it either lands before the count or waits until the delete is done and
  -- then fails to find the item — never in between.
  select * into v_item from items where id = p_item_id for update;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;

  -- ── blockers: money, and seeded config ──────────────────────────────────
  -- None of these can be cleared by settling, reversing or cancelling. They
  -- are the record that the money moved, so they block permanently; Archive is
  -- the path for an item that has any of them.
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
    raise exception '"%" is on %. Those records are permanent — settling, reversing or cancelling them does not release the item. Archive it instead.',
      v_item.name, array_to_string(v_blockers, ', ')
      using errcode = 'foreign_key_violation';
  end if;

  -- ── what is about to be cleared, for the audit trail ────────────────────
  -- Counts, not contents: this is a record that history was destroyed, not a
  -- means of getting it back. Recovery is a database restore.
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
      (select count(*) from supplier_items where item_id = p_item_id),
    'distribution_rate',
      (select count(*) from distribution_rates where item_id = p_item_id)
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
  -- All of it is one transaction: any failure below (a reference added by a
  -- path that does not take the share lock, say) rolls back the cleanup, the
  -- audit row and the activity row together. There is no half-deleted item.
  delete from supplier_items where item_id = p_item_id;
  delete from distribution_rates where item_id = p_item_id;
  delete from production_rates where item_id = p_item_id;
  delete from production_logs where item_id = p_item_id;
  -- production_assignment_members is ON DELETE CASCADE from the assignment.
  delete from production_assignments where item_id = p_item_id;
  -- Transaction-local, and scoped to this item: the append-only trigger lets
  -- through exactly these rows and nothing else. set_config(..., true) is
  -- rolled back with the transaction, so a failed delete leaves no window open.
  perform set_config('app.purging_item', p_item_id::text, true);
  delete from inventory_movements where item_id = p_item_id;
  perform set_config('app.purging_item', '', true);

  delete from inventory where item_id = p_item_id;
  delete from items where id = p_item_id;
end;
$$;

-- ── item_delete_impact  (Super Admin) — advisory preview ──────────────────
-- What the confirmation dialog shows. Authorization and the blocker rules live
-- in delete_item, which re-checks all of it under the row lock; this is a read
-- and nothing more. A stale preview can only ever mean the operator sees an
-- out-of-date number, never that a blocked delete goes through.
create or replace function public.item_delete_impact(p_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_item items;
begin
  perform app.require_super_admin();

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'itemId',   v_item.id,
    'itemName', v_item.name,
    'blockers', jsonb_build_object(
      'orderLines',
        (select count(*) from order_items where item_id = p_item_id),
      'draws',
        (select count(*) from distributions where item_id = p_item_id),
      'submissionMaterial',
        (select count(*) from submission_material_types
          where inventory_item_id = p_item_id)
    ),
    'clears', jsonb_build_object(
      'stockMovements',
        (select count(*) from inventory_movements where item_id = p_item_id),
      'onHand',
        coalesce((select current_quantity from inventory where item_id = p_item_id), 0),
      'productionAssignments',
        (select count(*) from production_assignments where item_id = p_item_id),
      'supplierListings',
        (select count(*) from supplier_items where item_id = p_item_id),
      'distributionRate',
        (select count(*) from distribution_rates where item_id = p_item_id)
    )
  );
end;
$$;

comment on function public.item_delete_impact(uuid) is
  'Advisory preview of what delete_item would destroy or refuse. Not an authorization decision — delete_item re-checks every blocker under a row lock.';

revoke all on function public.item_delete_impact(uuid) from public, anon;
grant execute on function public.item_delete_impact(uuid)
  to authenticated, service_role;
