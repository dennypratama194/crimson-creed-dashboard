-- ============================================================================
-- 0074_assignment_lock_order
-- Concurrency fix for the production assignment board.
--
-- 0067 locked the CREW LINE it was flipping but read the parent job unlocked,
-- so two Super Admins paying two different people on the same job never met:
--
--   T1  lock line A            T2  lock line B
--   T1  update A -> PAID       T2  update B -> PAID
--   T1  sync: B still UNPAID   T2  sync: A still UNPAID   (neither sees the
--   T1  rollup stays UNPAID    T2  rollup stays UNPAID     other's uncommitted
--                                                          row)
--
-- Both lines end PAID while the job reads UNPAID for ever, because nothing
-- recomputes the rollup again. The same gap let a payment overwrite a
-- CANCELLED job: sync_assignment_status re-read the status without a lock,
-- blocked on the cancel's row lock, then wrote its own rollup over it.
--
-- The rule from here on is PARENT FIRST, everywhere:
--
--   1. resolve the assignment id
--   2. select ... from production_assignments ... for update
--   3. re-read and re-validate the child under that lock
--   4. write, then recompute the rollup while still holding it
--
-- Crew lines are locked in `id` order when more than one is taken, so the
-- whole-crew path cannot deadlock against itself.
--
-- Also in this migration:
--   * a repeated same-state request is a no-op — it no longer rewrites
--     paid_by / paid_at, nor raises a second audit, activity or notification
--     row (0067 rewrote the attribution before comparing).
--   * create_production_assignment enforces items.category = 'PRODUCT', the
--     rule the picker (getAssignableProducts) already applied client-side and
--     set_distribution_rate has enforced server-side since 0070.
--
-- Signatures, grants and return types are unchanged.
-- ============================================================================

-- ── rollup helper ─────────────────────────────────────────────────────────
-- Takes the parent lock itself, so it is correct whether or not the caller
-- already holds it (row locks are re-entrant within a transaction).
create or replace function app.sync_assignment_status(p_assignment_id uuid)
returns production_assignment_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status production_assignment_status;
  v_next   production_assignment_status;
begin
  select status into v_status
  from production_assignments
  where id = p_assignment_id
  for update;

  if not found then
    return null;
  end if;

  -- A cancelled job stays cancelled whatever its crew lines say.
  if v_status = 'CANCELLED' then
    return v_status;
  end if;

  select case
           when count(*) = 0 then 'UNPAID'
           when count(*) filter (where status <> 'PAID') = 0 then 'PAID'
           else 'UNPAID'
         end::production_assignment_status
  into v_next
  from production_assignment_members
  where assignment_id = p_assignment_id;

  if v_next is distinct from v_status then
    update production_assignments set status = v_next where id = p_assignment_id;
  end if;

  return v_next;
end;
$$;

revoke all on function app.sync_assignment_status(uuid)
  from public, anon, authenticated;

-- ── set_assignment_member_paid  (Super Admin) — flip ONE person ────────────
create or replace function public.set_assignment_member_paid(
  p_line_id uuid,
  p_paid    boolean
)
returns production_assignment_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor         uuid := app.current_member_id();
  v_assignment_id uuid;
  v_line          production_assignment_members;
  v_job           production_assignments;
  v_was           production_assignment_status;
  v_target        production_assignment_status;
begin
  perform app.require_super_admin();

  if p_paid is null then
    raise exception 'A paid state is required' using errcode = 'check_violation';
  end if;
  if p_line_id is null then
    raise exception 'That person is not on this assignment' using errcode = 'no_data_found';
  end if;

  v_target := (case when p_paid then 'PAID' else 'UNPAID' end)::production_assignment_status;

  -- 1. resolve the parent. Unlocked: this only tells us WHICH job to lock.
  select assignment_id into v_assignment_id
  from production_assignment_members where id = p_line_id;
  if not found then
    raise exception 'That person is not on this assignment' using errcode = 'no_data_found';
  end if;

  -- 2. parent first.
  select * into v_job from production_assignments
  where id = v_assignment_id
  for update;
  if not found then
    raise exception 'Assignment not found' using errcode = 'no_data_found';
  end if;

  -- 3. re-read the child under the parent lock. A concurrent cancel, a repaint
  --    of the same line or a cascade delete may have landed while we waited.
  select * into v_line from production_assignment_members
  where id = p_line_id
  for update;
  if not found then
    raise exception 'That person is not on this assignment' using errcode = 'no_data_found';
  end if;
  if v_line.assignment_id <> v_assignment_id then
    raise exception 'That person is not on this assignment' using errcode = 'no_data_found';
  end if;

  if v_job.status = 'CANCELLED' then
    raise exception 'A cancelled assignment cannot be marked paid'
      using errcode = 'check_violation';
  end if;

  v_was := v_line.status;

  -- A repeat of the state the line is already in changes nothing at all: no
  -- rewritten attribution, no second audit row, no second notification.
  if v_was = v_target then
    return v_line;
  end if;

  update production_assignment_members
  set status  = v_target,
      paid_by = case when p_paid then v_actor else null end,
      paid_at = case when p_paid then now() else null end
  where id = p_line_id
  returning * into v_line;

  -- 4. recompute the rollup while the parent lock is still held.
  perform app.sync_assignment_status(v_assignment_id);

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'production.assignment_paid',
    format('%s marked %s for %s x%s',
           v_line.member_name_snapshot,
           case when p_paid then 'paid' else 'unpaid' end,
           v_job.item_name_snapshot, v_job.quantity),
    'PRODUCTION_ASSIGNMENT', v_job.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (
    v_actor, 'PRODUCTION_ASSIGNMENT_PAID', 'production_assignment_member', v_line.id,
    jsonb_build_object('status', v_was),
    jsonb_build_object('status', v_line.status, 'member_id', v_line.member_id)
  );

  if p_paid then
    perform app.notify_member(
      v_line.member_id, 'PRODUCTION_ASSIGNMENT_PAID',
      'Production marked paid',
      format('%s x%s has been marked paid.',
             v_job.item_name_snapshot, v_job.quantity),
      'PRODUCTION_ASSIGNMENT', v_job.id
    );
  end if;

  return v_line;
end;
$$;

-- ── set_production_assignment_paid  (Super Admin) — flip the WHOLE crew ────
create or replace function public.set_production_assignment_paid(
  p_assignment_id uuid,
  p_paid          boolean
)
returns production_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_line_id uuid;
  v_job     production_assignments;
  v_target  production_assignment_status;
begin
  perform app.require_super_admin();

  if p_paid is null then
    raise exception 'A paid state is required' using errcode = 'check_violation';
  end if;

  v_target := (case when p_paid then 'PAID' else 'UNPAID' end)::production_assignment_status;

  -- Parent first, before a single crew line is touched. This is what makes a
  -- whole-crew flip and a single-person flip serialize against each other.
  select * into v_job from production_assignments
  where id = p_assignment_id
  for update;
  if not found then
    raise exception 'Assignment not found' using errcode = 'no_data_found';
  end if;
  if v_job.status = 'CANCELLED' then
    raise exception 'A cancelled assignment cannot be marked paid'
      using errcode = 'check_violation';
  end if;

  -- Children in a fixed order, so two whole-crew flips queue rather than
  -- deadlock. set_assignment_member_paid re-reads each line under the parent
  -- lock this transaction already holds.
  for v_line_id in
    select id from production_assignment_members
    where assignment_id = p_assignment_id
      and status is distinct from v_target
    order by id
  loop
    perform public.set_assignment_member_paid(v_line_id, p_paid);
  end loop;

  select * into v_job from production_assignments where id = p_assignment_id;
  return v_job;
end;
$$;

-- ── cancel_production_assignment  (Super Admin) ────────────────────────────
-- Already parent-first since 0061; re-declared only to reject a null id with
-- the same message as a missing one, and to record the lock rule beside it.
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

  if p_assignment_id is null then
    raise exception 'Assignment not found' using errcode = 'no_data_found';
  end if;

  -- Parent first. A payment waiting on this lock re-reads the status after it
  -- is released and refuses, instead of writing its rollup over CANCELLED.
  select * into v_assignment from production_assignments
  where id = p_assignment_id
  for update;
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

-- ── create_production_assignment  (Super Admin) ────────────────────────────
-- Unchanged from 0067 except for the PRODUCT-category gate. The UI picker only
-- ever offered PRODUCT items; the RPC now agrees, so a direct call cannot
-- raise a job against a vest, a tool or a raw material. The check runs before
-- any row is written, and the whole function is one transaction, so a refusal
-- leaves no assignment, no crew line and no notification behind.
create or replace function public.create_production_assignment(
  p_member_ids uuid[],
  p_item_id    uuid,
  p_quantity   numeric,
  p_note       text default null
)
returns production_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := app.current_member_id();
  v_item       items;
  v_member     members;
  v_member_id  uuid;
  v_seen       uuid[] := '{}';
  v_assignment production_assignments;
  v_names      text[] := '{}';
begin
  perform app.require_super_admin();

  if p_member_ids is null or array_length(p_member_ids, 1) is null then
    raise exception 'Pick at least one person to put in charge'
      using errcode = 'check_violation';
  end if;
  if array_length(p_member_ids, 1) > 50 then
    raise exception 'That is too many people for one assignment'
      using errcode = 'check_violation';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero' using errcode = 'check_violation';
  end if;
  if p_quantity > 10000000 then
    raise exception 'That quantity is too large' using errcode = 'check_violation';
  end if;

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_item.archived_at is not null then
    raise exception 'Cannot assign production for an archived item'
      using errcode = 'check_violation';
  end if;
  if v_item.category <> 'PRODUCT' then
    raise exception 'Production can only be assigned for a Product item. Change this item''s category first.'
      using errcode = 'check_violation';
  end if;

  insert into production_assignments (
    item_id, item_name_snapshot, item_unit_snapshot, quantity, note, assigned_by
  )
  values (
    p_item_id, v_item.name, v_item.unit, p_quantity,
    nullif(btrim(p_note), ''), v_actor
  )
  returning * into v_assignment;

  foreach v_member_id in array p_member_ids
  loop
    -- Skip a repeated id rather than failing the whole assignment.
    if v_member_id = any (v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_member_id;

    select * into v_member from members where id = v_member_id;
    if not found then
      raise exception 'Member not found' using errcode = 'no_data_found';
    end if;
    if v_member.status <> 'ACTIVE' then
      raise exception '% is not an active member', v_member.display_name
        using errcode = 'check_violation';
    end if;

    insert into production_assignment_members (
      assignment_id, member_id, member_name_snapshot
    )
    values (v_assignment.id, v_member_id, v_member.display_name);

    v_names := v_names || v_member.display_name;

    perform app.notify_member(
      v_member_id, 'PRODUCTION_ASSIGNED',
      'New production assignment',
      format('You are in charge of %s x%s.', v_item.name, p_quantity),
      'PRODUCTION_ASSIGNMENT', v_assignment.id
    );
  end loop;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'production.assigned',
    format('%s assigned to produce %s x%s',
           array_to_string(v_names, ', '), v_item.name, p_quantity),
    'PRODUCTION_ASSIGNMENT', v_assignment.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'PRODUCTION_ASSIGNMENT_CREATED', 'production_assignment',
    v_assignment.id,
    jsonb_build_object(
      'member_ids', to_jsonb(v_seen), 'item_id', p_item_id, 'quantity', p_quantity
    )
  );

  return v_assignment;
end;
$$;

-- Grants survive CREATE OR REPLACE, but are re-stated so this file alone lands
-- in the same place on a clean install.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_production_assignment(uuid[], uuid, numeric, text)',
    'set_assignment_member_paid(uuid, boolean)',
    'set_production_assignment_paid(uuid, boolean)',
    'cancel_production_assignment(uuid, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
