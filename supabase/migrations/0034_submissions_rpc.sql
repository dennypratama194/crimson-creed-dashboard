-- ============================================================================
-- 0034_submissions_rpc
-- Atomic SECURITY DEFINER writes for the Monthly Material Submissions module (Phase 17).
--
--   * Members submit against the CURRENT month only — the month is derived on
--     the server, never taken from the client.
--   * A CONFIRMED submission posts one inventory movement per material for the
--     signed delta vs what was previously posted; re-confirming after an
--     adjustment posts the difference, never a direct edit to current_quantity.
--   * Rejecting a CONFIRMED submission reverses its posted stock.
--
-- Every write leaves an audit + activity row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- app.ensure_submission_period  (internal) — lazily create a month row
-- ---------------------------------------------------------------------------
create or replace function app.ensure_submission_period(p_month date)
returns submission_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_first  date := date_trunc('month', p_month)::date;
  v_period submission_periods;
begin
  insert into submission_periods (period_month, created_by)
  values (v_first, app.current_member_id())
  on conflict (period_month) do nothing;

  select * into v_period from submission_periods where period_month = v_first;
  return v_period;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.submission_line_qty  (internal) — pull one quantity out of a jsonb payload
-- ---------------------------------------------------------------------------
create or replace function app.submission_line_qty(p_lines jsonb, p_type_id uuid)
returns integer
language sql
immutable
as $$
  select (e->>'quantity')::int
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
  where (e->>'material_type_id')::uuid = p_type_id
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- set_submission_targets  (Super Admin) — per-month quota per material
-- ---------------------------------------------------------------------------
create or replace function public.set_submission_targets(
  p_period_month date,
  p_targets      jsonb
)
returns submission_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := app.current_member_id();
  v_period submission_periods;
  v_row    jsonb;
  v_type   uuid;
  v_qty    integer;
begin
  perform app.require_super_admin();

  if p_period_month is null then
    raise exception 'A month is required' using errcode = 'check_violation';
  end if;
  if date_trunc('month', p_period_month)::date > date_trunc('month', current_date)::date then
    raise exception 'That month has not started yet' using errcode = 'check_violation';
  end if;

  v_period := app.ensure_submission_period(p_period_month);

  for v_row in select * from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb))
  loop
    v_type := (v_row->>'material_type_id')::uuid;
    v_qty  := coalesce((v_row->>'target_quantity')::int, 0);

    if v_qty < 0 then
      raise exception 'A target cannot be negative' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from submission_material_types where id = v_type) then
      raise exception 'Unknown material type' using errcode = 'foreign_key_violation';
    end if;

    insert into submission_period_targets (period_id, material_type_id, target_quantity, updated_by)
    values (v_period.id, v_type, v_qty, v_actor)
    on conflict (period_id, material_type_id) do update
      set target_quantity = excluded.target_quantity,
          updated_by = excluded.updated_by,
          updated_at = now();
  end loop;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'submission.targets_set',
    format('Set material targets for %s', to_char(v_period.period_month, 'Mon YYYY')),
    'SUBMISSION', v_period.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'SUBMISSION_TARGETS_SET', 'submission_period', v_period.id,
    jsonb_build_object('period_month', v_period.period_month, 'targets', coalesce(p_targets, '[]'::jsonb))
  );

  return v_period;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_material_submission  (member) — "here is my hand-in for this month"
-- ---------------------------------------------------------------------------
create or replace function public.submit_material_submission(
  p_lines jsonb,
  p_note  text default null
)
returns member_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id   uuid;
  v_member_name text;
  v_period      submission_periods;
  v_existing    member_submissions;
  v_submission  member_submissions;
  v_mt          record;
  v_qty         integer;
begin
  select m.id, m.display_name into v_member_id, v_member_name
  from members m
  where m.user_id = auth.uid() and m.status = 'ACTIVE';

  if v_member_id is null then
    raise exception 'Only active members can submit materials'
      using errcode = 'insufficient_privilege';
  end if;

  -- reject any payload line that names a material that is not collectable
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
    where not exists (
      select 1 from submission_material_types mt
      where mt.id = (e->>'material_type_id')::uuid and mt.active
    )
  ) then
    raise exception 'That material is not being collected' using errcode = 'foreign_key_violation';
  end if;

  v_period := app.ensure_submission_period(current_date);

  select * into v_existing from member_submissions
  where period_id = v_period.id and member_id = v_member_id
  for update;

  if found and v_existing.status = 'CONFIRMED' then
    raise exception 'Your submission for this month is already confirmed'
      using errcode = 'check_violation';
  end if;

  insert into member_submissions (period_id, member_id, status, note, submitted_at)
  values (v_period.id, v_member_id, 'PENDING', nullif(btrim(p_note), ''), now())
  on conflict (period_id, member_id) do update
    set status = 'PENDING',
        note = excluded.note,
        submitted_at = now(),
        confirmed_by = null,
        confirmed_at = null,
        review_note = null
  returning * into v_submission;

  for v_mt in
    select id, name, unit from submission_material_types where active order by sort_order
  loop
    v_qty := coalesce(app.submission_line_qty(p_lines, v_mt.id), 0);
    if v_qty < 0 or v_qty > 10000000 then
      raise exception 'Enter a whole number between 0 and 10,000,000' using errcode = 'check_violation';
    end if;

    insert into member_submission_lines (
      member_submission_id, material_type_id, name_snapshot, unit_snapshot, quantity
    )
    values (v_submission.id, v_mt.id, v_mt.name, v_mt.unit, v_qty)
    on conflict (member_submission_id, material_type_id) do update
      set quantity = excluded.quantity,
          name_snapshot = excluded.name_snapshot,
          unit_snapshot = excluded.unit_snapshot;
  end loop;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_member_id, 'submission.submitted',
    format('%s submitted materials for %s',
           v_member_name, to_char(v_period.period_month, 'Mon YYYY')),
    'SUBMISSION', v_submission.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_member_id, 'SUBMISSION_SUBMITTED', 'member_submission', v_submission.id, to_jsonb(v_submission));

  perform app.notify_super_admins(
    'SUBMISSION_SUBMITTED',
    'Material submission to review',
    format('%s submitted their materials for %s.',
           v_member_name, to_char(v_period.period_month, 'Mon YYYY')),
    'SUBMISSION', v_submission.id
  );

  return v_submission;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_member_submission  (Super Admin) — verify, count, post stock
-- ---------------------------------------------------------------------------
create or replace function public.confirm_member_submission(
  p_submission_id uuid,
  p_lines         jsonb default null,
  p_note          text  default null
)
returns member_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor        uuid := app.current_member_id();
  v_submission   member_submissions;
  v_was_confirmed boolean;
  v_mt           record;
  v_new_qty      integer;
  v_delta        integer;
begin
  perform app.require_super_admin();

  select * into v_submission from member_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found' using errcode = 'no_data_found';
  end if;
  if v_submission.status = 'REJECTED' then
    raise exception 'A rejected submission must be resubmitted by the member first'
      using errcode = 'check_violation';
  end if;

  v_was_confirmed := v_submission.status = 'CONFIRMED';

  for v_mt in
    select mt.id, mt.inventory_item_id, mt.name, mt.unit,
           coalesce(l.quantity, 0) as current_qty,
           l.id as line_id
    from submission_material_types mt
    left join member_submission_lines l
      on l.member_submission_id = p_submission_id and l.material_type_id = mt.id
    where mt.active or l.id is not null
  loop
    v_new_qty := coalesce(app.submission_line_qty(p_lines, v_mt.id), v_mt.current_qty);
    if v_new_qty < 0 or v_new_qty > 10000000 then
      raise exception 'Enter a whole number between 0 and 10,000,000' using errcode = 'check_violation';
    end if;

    if v_mt.line_id is null then
      insert into member_submission_lines (
        member_submission_id, material_type_id, name_snapshot, unit_snapshot, quantity
      )
      values (p_submission_id, v_mt.id, v_mt.name, v_mt.unit, v_new_qty);
    else
      update member_submission_lines
      set quantity = v_new_qty, name_snapshot = v_mt.name, unit_snapshot = v_mt.unit
      where id = v_mt.line_id;
    end if;

    -- signed delta vs what this submission has already put into stock
    v_delta := v_new_qty - (case when v_was_confirmed then v_mt.current_qty else 0 end);
    if v_delta <> 0 then
      insert into inventory_movements (
        item_id, quantity, movement_type, reference_type, reference_id, performed_by, notes
      )
      values (
        v_mt.inventory_item_id, v_delta, 'SUBMISSION', 'SUBMISSION', p_submission_id, v_actor,
        format('Monthly submission %s', case when v_was_confirmed then 'adjustment' else 'confirmed' end)
      );

      insert into inventory (item_id, current_quantity, updated_at)
      values (v_mt.inventory_item_id, v_delta, now())
      on conflict (item_id) do update
        set current_quantity = inventory.current_quantity + v_delta,
            updated_at = now();
    end if;
  end loop;

  update member_submissions
  set status = 'CONFIRMED',
      confirmed_by = v_actor,
      confirmed_at = now(),
      review_note = nullif(btrim(p_note), '')
  where id = p_submission_id
  returning * into v_submission;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor,
    case when v_was_confirmed then 'submission.adjusted' else 'submission.confirmed' end,
    format('%s material submission #%s',
           case when v_was_confirmed then 'Adjusted' else 'Confirmed' end,
           left(v_submission.id::text, 8)),
    'SUBMISSION', v_submission.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'SUBMISSION_CONFIRMED', 'member_submission', v_submission.id,
    jsonb_build_object('adjusted', v_was_confirmed, 'note', nullif(btrim(p_note), ''))
  );

  if not v_was_confirmed then
    perform app.notify_member(
      v_submission.member_id, 'SUBMISSION_CONFIRMED',
      'Materials confirmed',
      'Your monthly material submission has been confirmed.',
      'SUBMISSION', v_submission.id
    );
  end if;

  return v_submission;
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_member_submission  (Super Admin) — bounce back, reverse any stock
-- ---------------------------------------------------------------------------
create or replace function public.reject_member_submission(
  p_submission_id uuid,
  p_reason        text
)
returns member_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := app.current_member_id();
  v_submission member_submissions;
  v_line       record;
begin
  perform app.require_super_admin();

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to reject' using errcode = 'check_violation';
  end if;

  select * into v_submission from member_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Submission not found' using errcode = 'no_data_found';
  end if;
  if v_submission.status = 'REJECTED' then
    raise exception 'This submission is already rejected' using errcode = 'check_violation';
  end if;

  -- undo the stock a previous confirm posted
  if v_submission.status = 'CONFIRMED' then
    for v_line in
      select l.quantity, mt.inventory_item_id
      from member_submission_lines l
      join submission_material_types mt on mt.id = l.material_type_id
      where l.member_submission_id = p_submission_id and l.quantity > 0
    loop
      insert into inventory_movements (
        item_id, quantity, movement_type, reference_type, reference_id, performed_by, notes
      )
      values (
        v_line.inventory_item_id, -v_line.quantity, 'SUBMISSION', 'SUBMISSION',
        p_submission_id, v_actor, 'Monthly submission rejected — stock reversed'
      );

      update inventory
      set current_quantity = current_quantity - v_line.quantity, updated_at = now()
      where item_id = v_line.inventory_item_id;
    end loop;
  end if;

  update member_submissions
  set status = 'REJECTED',
      confirmed_by = null,
      confirmed_at = null,
      review_note = btrim(p_reason)
  where id = p_submission_id
  returning * into v_submission;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'submission.rejected',
    format('Rejected material submission #%s', left(v_submission.id::text, 8)),
    'SUBMISSION', v_submission.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'SUBMISSION_REJECTED', 'member_submission', v_submission.id,
    jsonb_build_object('reason', btrim(p_reason))
  );

  perform app.notify_member(
    v_submission.member_id, 'SUBMISSION_REJECTED',
    'Materials rejected',
    coalesce(nullif(btrim(p_reason), ''), 'Your monthly material submission was rejected.'),
    'SUBMISSION', v_submission.id
  );

  return v_submission;
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
    'set_submission_targets(date, jsonb)',
    'submit_material_submission(jsonb, text)',
    'confirm_member_submission(uuid, jsonb, text)',
    'reject_member_submission(uuid, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;

revoke all on function app.ensure_submission_period(date) from public, anon, authenticated;
revoke all on function app.submission_line_qty(jsonb, uuid) from public, anon;
