-- ============================================================================
-- 0053_submission_received_by
-- Records the PIC — the Super Admin a member handed their monthly materials to.
--
--   member_submissions.received_by       : live reference to the receiver
--                                          (members.id, a Super Admin).
--   member_submissions.received_by_name  : snapshot of that person's display
--                                          name at submit / confirm time, so a
--                                          later rename or deactivation never
--                                          rewrites the record (same rule as the
--                                          material name/unit snapshots).
--
-- A member must name the receiver when submitting; a Super Admin may correct it
-- when confirming. Rows that predate this migration keep NULL on both columns.
-- ============================================================================

alter table member_submissions
  add column received_by      uuid references members (id) on delete set null,
  add column received_by_name text;

comment on column member_submissions.received_by is
  'The Super Admin the member handed their materials to (PIC). Required at submit; a Super Admin may correct it at confirm. NULL on rows that predate the field.';
comment on column member_submissions.received_by_name is
  'Snapshot of received_by''s display name at submit/confirm time. Reads use this so a later rename or deactivation never rewrites the record.';

create index member_submissions_received_by_idx on member_submissions (received_by);

-- ---------------------------------------------------------------------------
-- list_submission_receivers  (active member) — the picker feed
-- A regular member cannot SELECT other members' rows (RLS), so the submit form
-- gets its Super Admin list from here.
-- ---------------------------------------------------------------------------
create or replace function public.list_submission_receivers()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, m.display_name
  from members m
  where m.role = 'SUPER_ADMIN'
    and m.status = 'ACTIVE'
    and app.is_active_member()
  order by m.display_name;
$$;

comment on function public.list_submission_receivers() is
  'Active Super Admins, for the "received by" picker on a monthly material submission.';

revoke all on function public.list_submission_receivers() from public, anon;
grant execute on function public.list_submission_receivers()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- submit_material_submission — now requires p_received_by (a Super Admin).
-- The 3-arg form is dropped so callers resolve unambiguously to the new one.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_material_submission(jsonb, text, date);

create or replace function public.submit_material_submission(
  p_lines        jsonb,
  p_note         text default null,
  p_period_month date default null,
  p_received_by  uuid default null
)
returns member_submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id     uuid;
  v_member_name   text;
  v_current_month date := date_trunc('month', current_date)::date;
  v_target_month  date;
  v_received_name text;
  v_period        submission_periods;
  v_existing      member_submissions;
  v_submission    member_submissions;
  v_mt            record;
  v_qty           integer;
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

  if p_received_by is null then
    raise exception 'Choose who received your submission' using errcode = 'check_violation';
  end if;
  select m.display_name into v_received_name
  from members m
  where m.id = p_received_by and m.role = 'SUPER_ADMIN' and m.status = 'ACTIVE';
  if v_received_name is null then
    raise exception 'That person cannot receive submissions'
      using errcode = 'foreign_key_violation';
  end if;

  v_target_month := coalesce(date_trunc('month', p_period_month)::date, v_current_month);

  if v_target_month > v_current_month then
    raise exception 'That month has not started yet' using errcode = 'check_violation';
  end if;

  if v_target_month < v_current_month
     and not exists (
       select 1 from app.member_owed_months(v_member_id) mo where mo = v_target_month
     ) then
    raise exception 'You have nothing outstanding to hand in for that month'
      using errcode = 'check_violation';
  end if;

  v_period := app.ensure_submission_period(v_target_month);

  select * into v_existing from member_submissions
  where period_id = v_period.id and member_id = v_member_id
  for update;

  if found and v_existing.status = 'CONFIRMED' then
    raise exception 'Your submission for this month is already confirmed'
      using errcode = 'check_violation';
  end if;

  insert into member_submissions (
    period_id, member_id, status, note, submitted_at, received_by, received_by_name
  )
  values (
    v_period.id, v_member_id, 'PENDING', nullif(btrim(p_note), ''), now(),
    p_received_by, v_received_name
  )
  on conflict (period_id, member_id) do update
    set status = 'PENDING',
        note = excluded.note,
        submitted_at = now(),
        received_by = excluded.received_by,
        received_by_name = excluded.received_by_name,
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
    format('%s submitted materials for %s (received by %s)',
           v_member_name, to_char(v_period.period_month, 'Mon YYYY'), v_received_name),
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

revoke all on function public.submit_material_submission(jsonb, text, date, uuid) from public, anon;
grant execute on function public.submit_material_submission(jsonb, text, date, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- confirm_member_submission — optional p_received_by lets a Super Admin correct
-- the PIC while reviewing. NULL leaves whatever the member set untouched.
-- The 3-arg form is dropped so callers resolve unambiguously to the new one.
-- ---------------------------------------------------------------------------
drop function if exists public.confirm_member_submission(uuid, jsonb, text);

create or replace function public.confirm_member_submission(
  p_submission_id uuid,
  p_lines         jsonb default null,
  p_note          text  default null,
  p_received_by   uuid  default null
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
  v_received_by  uuid;
  v_received_name text;
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

  v_received_by := coalesce(p_received_by, v_submission.received_by);
  v_received_name := v_submission.received_by_name;
  if p_received_by is not null then
    select m.display_name into v_received_name
    from members m
    where m.id = p_received_by and m.role = 'SUPER_ADMIN' and m.status = 'ACTIVE';
    if v_received_name is null then
      raise exception 'That person cannot receive submissions'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

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
      received_by = v_received_by,
      received_by_name = v_received_name,
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

revoke all on function public.confirm_member_submission(uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.confirm_member_submission(uuid, jsonb, text, uuid)
  to authenticated, service_role;
