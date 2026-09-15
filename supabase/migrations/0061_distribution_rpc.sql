-- ============================================================================
-- 0061_distribution_rpc
-- Atomic SECURITY DEFINER writes for Phase 19.
--
-- amount_owed is ALWAYS computed here (quantity x snapshot rate) — never
-- trusted from the client, same rule as order totals. Issuing a draw and
-- moving the stock happen in one transaction: if the stash is short, nothing
-- is written at all.
--
-- Nothing in this file posts to cash_entries. A SETTLED draw or a PAID
-- assignment is a record that it happened, not a treasury movement.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- set_distribution_rate  (Super Admin) — upsert the company cut for one item.
-- Called once per drawable item; the org keeps a rate for each, not just one.
-- ---------------------------------------------------------------------------
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
  -- Drawable goods live in the company stash, never in the member-facing shop,
  -- so a member can never both order and draw the same item.
  if v_item.stock_type = 'CATALOGUE' then
    raise exception 'Only company stash items can be distributed. Change the stock type in Company stash first.'
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

-- ---------------------------------------------------------------------------
-- remove_distribution_rate  (Super Admin) — the item stops being drawable.
-- Existing draws are untouched: their rate is snapshotted on the row.
-- ---------------------------------------------------------------------------
create or replace function public.remove_distribution_rate(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_item  items;
  v_old   distribution_rates;
begin
  perform app.require_super_admin();

  select * into v_old from distribution_rates where item_id = p_item_id;
  if not found then
    return;
  end if;

  select * into v_item from items where id = p_item_id;

  delete from distribution_rates where item_id = p_item_id;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'distribution.rate_removed',
          format('"%s" is no longer distributable', coalesce(v_item.name, 'Item')),
          'ITEM', p_item_id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values)
  values (v_actor, 'DISTRIBUTION_RATE_REMOVED', 'item', p_item_id,
          jsonb_build_object('unit_rate', v_old.unit_rate));
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_distribution  (Super Admin) — "this member drew N units; they owe
-- N x rate back". Inserts the debt, posts the DISTRIBUTION movement and
-- decrements the stash in one transaction.
-- ---------------------------------------------------------------------------
create or replace function public.issue_distribution(
  p_member_id uuid,
  p_item_id   uuid,
  p_quantity  integer,
  p_note      text default null
)
returns distributions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := app.current_member_id();
  v_member members;
  v_item   items;
  v_rate   distribution_rates;
  v_inv    inventory;
  v_dist   distributions;
  v_amount numeric(14, 2);
begin
  perform app.require_super_admin();

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a whole quantity greater than zero' using errcode = 'check_violation';
  end if;
  if p_quantity > 10000000 then
    raise exception 'That quantity is too large' using errcode = 'check_violation';
  end if;

  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'Member not found' using errcode = 'no_data_found';
  end if;
  if v_member.status <> 'ACTIVE' then
    raise exception 'Only active members can draw stock' using errcode = 'check_violation';
  end if;

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_item.archived_at is not null then
    raise exception 'Cannot distribute an archived item' using errcode = 'check_violation';
  end if;

  select * into v_rate from distribution_rates where item_id = p_item_id;
  if not found then
    raise exception 'Set a company cut for this item before distributing it'
      using errcode = 'check_violation';
  end if;

  -- Lock the stash row so two concurrent draws cannot both pass the check.
  select * into v_inv from inventory where item_id = p_item_id for update;
  if not found or v_inv.current_quantity < p_quantity then
    raise exception 'Only % in stock — cannot release %',
      coalesce(v_inv.current_quantity, 0), p_quantity
      using errcode = 'check_violation';
  end if;

  v_amount := round(p_quantity::numeric * v_rate.unit_rate, 2);

  insert into distributions (
    member_id, item_id, item_name_snapshot, item_unit_snapshot,
    quantity, unit_rate_snapshot, amount_owed, note, issued_by
  )
  values (
    p_member_id, p_item_id, v_item.name, v_item.unit,
    p_quantity, v_rate.unit_rate, v_amount, nullif(btrim(p_note), ''), v_actor
  )
  returning * into v_dist;

  insert into inventory_movements (
    item_id, quantity, movement_type, reference_type, reference_id, performed_by, notes
  )
  values (
    p_item_id, -p_quantity, 'DISTRIBUTION', 'DISTRIBUTION', v_dist.id, v_actor,
    format('Draw %s — %s', v_dist.draw_number, v_member.display_name)
  );

  update inventory
  set current_quantity = current_quantity - p_quantity, updated_at = now()
  where item_id = p_item_id
  returning * into v_inv;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'distribution.issued',
    format('%s drew %s x%s — owes %s',
           v_member.display_name, v_item.name, p_quantity, v_amount),
    'DISTRIBUTION', v_dist.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'DISTRIBUTION_ISSUED', 'distribution', v_dist.id,
    jsonb_build_object(
      'member_id', p_member_id, 'item_id', p_item_id, 'quantity', p_quantity,
      'unit_rate', v_rate.unit_rate, 'amount_owed', v_amount
    )
  );

  perform app.notify_member(
    p_member_id, 'DISTRIBUTION_ISSUED',
    format('Stock released — %s', v_item.name),
    format('%s x%s. You owe the company %s.', v_item.name, p_quantity, v_amount),
    'DISTRIBUTION', v_dist.id
  );

  if v_item.low_stock_threshold > 0 and v_inv.current_quantity <= v_item.low_stock_threshold then
    perform app.notify_super_admins('LOW_STOCK',
            format('Low stock — %s', v_item.name),
            format('%s is at %s (threshold %s).', v_item.name, v_inv.current_quantity,
                   v_item.low_stock_threshold),
            'ITEM', p_item_id);
  end if;

  return v_dist;
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_distribution  (Super Admin) — the member handed the cut back in full.
-- A label, not a cash posting.
-- ---------------------------------------------------------------------------
create or replace function public.settle_distribution(
  p_distribution_id uuid,
  p_note text default null
)
returns distributions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_dist  distributions;
begin
  perform app.require_super_admin();

  select * into v_dist from distributions where id = p_distribution_id for update;
  if not found then
    raise exception 'Draw not found' using errcode = 'no_data_found';
  end if;
  if v_dist.status = 'SETTLED' then
    raise exception 'This draw is already settled' using errcode = 'check_violation';
  end if;
  if v_dist.status = 'REVERSED' then
    raise exception 'A reversed draw cannot be settled' using errcode = 'check_violation';
  end if;

  update distributions
  set status = 'SETTLED',
      settled_by = v_actor,
      settled_at = now(),
      resolution_note = nullif(btrim(p_note), '')
  where id = p_distribution_id
  returning * into v_dist;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'distribution.settled',
    format('Draw %s settled — %s', v_dist.draw_number, v_dist.amount_owed),
    'DISTRIBUTION', v_dist.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'DISTRIBUTION_SETTLED', 'distribution', v_dist.id,
    jsonb_build_object('amount_owed', v_dist.amount_owed, 'note', v_dist.resolution_note)
  );

  perform app.notify_member(
    v_dist.member_id, 'DISTRIBUTION_SETTLED',
    format('Draw %s settled', v_dist.draw_number),
    format('Your %s of %s is cleared.', v_dist.amount_owed, v_dist.item_name_snapshot),
    'DISTRIBUTION', v_dist.id
  );

  return v_dist;
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_distribution  (Super Admin) — undo a mis-entered draw. Returns the
-- stock to the stash and voids the debt. Works from OPEN or SETTLED so a wrong
-- quantity is fixable after the fact; a reversed draw is final.
-- ---------------------------------------------------------------------------
create or replace function public.reverse_distribution(
  p_distribution_id uuid,
  p_reason text
)
returns distributions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_dist  distributions;
begin
  perform app.require_super_admin();

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to reverse a draw' using errcode = 'check_violation';
  end if;

  select * into v_dist from distributions where id = p_distribution_id for update;
  if not found then
    raise exception 'Draw not found' using errcode = 'no_data_found';
  end if;
  if v_dist.status = 'REVERSED' then
    raise exception 'This draw is already reversed' using errcode = 'check_violation';
  end if;

  insert into inventory_movements (
    item_id, quantity, movement_type, reference_type, reference_id, performed_by, notes
  )
  values (
    v_dist.item_id, v_dist.quantity, 'DISTRIBUTION', 'DISTRIBUTION', v_dist.id, v_actor,
    format('Draw %s reversed — stock returned', v_dist.draw_number)
  );

  insert into inventory (item_id, current_quantity, updated_at)
  values (v_dist.item_id, v_dist.quantity, now())
  on conflict (item_id) do update
    set current_quantity = inventory.current_quantity + excluded.current_quantity,
        updated_at = now();

  update distributions
  set status = 'REVERSED',
      reversed_by = v_actor,
      reversed_at = now(),
      resolution_note = btrim(p_reason)
  where id = p_distribution_id
  returning * into v_dist;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'distribution.reversed',
    format('Draw %s reversed — %s x%s returned to stash',
           v_dist.draw_number, v_dist.item_name_snapshot, v_dist.quantity),
    'DISTRIBUTION', v_dist.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'DISTRIBUTION_REVERSED', 'distribution', v_dist.id,
    jsonb_build_object('quantity_returned', v_dist.quantity, 'reason', v_dist.resolution_note)
  );

  perform app.notify_member(
    v_dist.member_id, 'DISTRIBUTION_REVERSED',
    format('Draw %s cancelled', v_dist.draw_number),
    format('%s x%s was recorded in error. You owe nothing for it.',
           v_dist.item_name_snapshot, v_dist.quantity),
    'DISTRIBUTION', v_dist.id
  );

  return v_dist;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_production_assignment  (Super Admin) — put a member in charge of a
-- production job. Members never file one; they only read their own.
-- ---------------------------------------------------------------------------
create or replace function public.create_production_assignment(
  p_member_id uuid,
  p_item_id   uuid,
  p_quantity  numeric,
  p_note      text default null
)
returns production_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := app.current_member_id();
  v_member     members;
  v_item       items;
  v_assignment production_assignments;
begin
  perform app.require_super_admin();

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero' using errcode = 'check_violation';
  end if;
  if p_quantity > 10000000 then
    raise exception 'That quantity is too large' using errcode = 'check_violation';
  end if;

  select * into v_member from members where id = p_member_id;
  if not found then
    raise exception 'Member not found' using errcode = 'no_data_found';
  end if;
  if v_member.status <> 'ACTIVE' then
    raise exception 'Only active members can be assigned production' using errcode = 'check_violation';
  end if;

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_item.archived_at is not null then
    raise exception 'Cannot assign production for an archived item' using errcode = 'check_violation';
  end if;

  insert into production_assignments (
    member_id, item_id, item_name_snapshot, item_unit_snapshot,
    quantity, note, assigned_by
  )
  values (
    p_member_id, p_item_id, v_item.name, v_item.unit,
    p_quantity, nullif(btrim(p_note), ''), v_actor
  )
  returning * into v_assignment;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'production.assigned',
    format('%s assigned to produce %s x%s', v_member.display_name, v_item.name, p_quantity),
    'PRODUCTION_ASSIGNMENT', v_assignment.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'PRODUCTION_ASSIGNMENT_CREATED', 'production_assignment', v_assignment.id,
    jsonb_build_object('member_id', p_member_id, 'item_id', p_item_id, 'quantity', p_quantity)
  );

  perform app.notify_member(
    p_member_id, 'PRODUCTION_ASSIGNED',
    'New production assignment',
    format('You are in charge of %s x%s.', v_item.name, p_quantity),
    'PRODUCTION_ASSIGNMENT', v_assignment.id
  );

  return v_assignment;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_production_assignment_paid  (Super Admin) — flip the paid flag.
-- Bookkeeping only; posts nothing to company cash.
-- ---------------------------------------------------------------------------
create or replace function public.set_production_assignment_paid(
  p_assignment_id uuid,
  p_paid boolean
)
returns production_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := app.current_member_id();
  v_assignment production_assignments;
  v_was        production_assignment_status;
begin
  perform app.require_super_admin();

  if p_paid is null then
    raise exception 'A paid state is required' using errcode = 'check_violation';
  end if;

  select * into v_assignment from production_assignments
  where id = p_assignment_id for update;
  if not found then
    raise exception 'Assignment not found' using errcode = 'no_data_found';
  end if;
  if v_assignment.status = 'CANCELLED' then
    raise exception 'A cancelled assignment cannot be marked paid' using errcode = 'check_violation';
  end if;

  v_was := v_assignment.status;

  update production_assignments
  set status  = case when p_paid then 'PAID' else 'UNPAID' end::production_assignment_status,
      paid_by = case when p_paid then v_actor else null end,
      paid_at = case when p_paid then now() else null end
  where id = p_assignment_id
  returning * into v_assignment;

  if v_was = v_assignment.status then
    return v_assignment;
  end if;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'production.assignment_paid',
    format('%s x%s marked %s',
           v_assignment.item_name_snapshot, v_assignment.quantity,
           case when p_paid then 'paid' else 'unpaid' end),
    'PRODUCTION_ASSIGNMENT', v_assignment.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (
    v_actor, 'PRODUCTION_ASSIGNMENT_PAID', 'production_assignment', v_assignment.id,
    jsonb_build_object('status', v_was),
    jsonb_build_object('status', v_assignment.status)
  );

  if p_paid then
    perform app.notify_member(
      v_assignment.member_id, 'PRODUCTION_ASSIGNMENT_PAID',
      'Production marked paid',
      format('%s x%s has been marked paid.',
             v_assignment.item_name_snapshot, v_assignment.quantity),
      'PRODUCTION_ASSIGNMENT', v_assignment.id
    );
  end if;

  return v_assignment;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_production_assignment  (Super Admin) — soft-delete a mis-entered row.
-- It stays visible in history; it stops counting as outstanding work.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_production_assignment(
  p_assignment_id uuid,
  p_reason text default null
)
returns production_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := app.current_member_id();
  v_assignment production_assignments;
begin
  perform app.require_super_admin();

  select * into v_assignment from production_assignments
  where id = p_assignment_id for update;
  if not found then
    raise exception 'Assignment not found' using errcode = 'no_data_found';
  end if;
  if v_assignment.status = 'CANCELLED' then
    raise exception 'This assignment is already cancelled' using errcode = 'check_violation';
  end if;

  update production_assignments
  set status       = 'CANCELLED',
      cancelled_by = v_actor,
      cancelled_at = now(),
      note         = coalesce(nullif(btrim(p_reason), ''), note)
  where id = p_assignment_id
  returning * into v_assignment;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'production.assignment_cancelled',
    format('Assignment for %s x%s cancelled',
           v_assignment.item_name_snapshot, v_assignment.quantity),
    'PRODUCTION_ASSIGNMENT', v_assignment.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'PRODUCTION_ASSIGNMENT_CANCELLED', 'production_assignment', v_assignment.id,
    jsonb_build_object('reason', nullif(btrim(p_reason), ''))
  );

  return v_assignment;
end;
$$;

-- ---------------------------------------------------------------------------
-- read aggregates (SQL-side, one round-trip — see 0057)
-- ---------------------------------------------------------------------------

-- Outstanding debt per member, Super Admin only.
create or replace function public.distribution_outstanding_by_member()
returns table (
  member_id     uuid,
  member_name   text,
  open_draws    bigint,
  open_quantity numeric,
  outstanding   numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_super_admin();

  return query
  select d.member_id,
         m.display_name,
         count(*)::bigint,
         coalesce(sum(d.quantity), 0)::numeric,
         coalesce(sum(d.amount_owed), 0)::numeric
  from distributions d
  join members m on m.id = d.member_id
  where d.status = 'OPEN'
  group by d.member_id, m.display_name
  order by coalesce(sum(d.amount_owed), 0) desc;
end;
$$;

-- The calling member's own totals. Caller-scoped even for a Super Admin, so
-- the member-facing page never sums the whole organisation (see 0057).
create or replace function public.my_distribution_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_member uuid := app.current_member_id();
begin
  if v_member is null then
    raise exception 'Only active members can read their distributions'
      using errcode = 'insufficient_privilege';
  end if;

  return (
    select jsonb_build_object(
      'openDraws',     coalesce(count(*) filter (where status = 'OPEN'), 0),
      'openAmount',    coalesce(sum(amount_owed) filter (where status = 'OPEN'), 0),
      'settledDraws',  coalesce(count(*) filter (where status = 'SETTLED'), 0),
      'settledAmount', coalesce(sum(amount_owed) filter (where status = 'SETTLED'), 0)
    )
    from distributions
    where member_id = v_member
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'set_distribution_rate(uuid, numeric)',
    'remove_distribution_rate(uuid)',
    'issue_distribution(uuid, uuid, integer, text)',
    'settle_distribution(uuid, text)',
    'reverse_distribution(uuid, text)',
    'create_production_assignment(uuid, uuid, numeric, text)',
    'set_production_assignment_paid(uuid, boolean)',
    'cancel_production_assignment(uuid, text)',
    'distribution_outstanding_by_member()',
    'my_distribution_summary()'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
