-- ============================================================================
-- 0084_submission_past_months_first
-- Phase 17b follow-up — owed months are handed in before the current one.
--
-- While the order gate is on, a member who still owes an earlier month cannot
-- file the CURRENT month until every owed month has at least been handed in.
-- "Handed in" means a PENDING submission exists: a MISSING or REJECTED owed
-- month blocks, a PENDING one does not. Ordering itself is unchanged — the
-- order gate still clears only on CONFIRMED (strict, agreed in 17b).
--
--   app.member_owed_submissions(member)
--     Each owed month (app.member_owed_months) with the member's submission
--     status for it — NULL when nothing was filed. Never CONFIRMED: a
--     confirmed month is not owed.
--
--   my_owed_submissions()
--     The same, for the signed-in member, oldest first. Feeds the member
--     /submissions page, which hides the current month's button while a
--     MISSING / REJECTED month remains.
--
--   submit_material_submission
--     Refuses the current month while app.member_owed_submissions has a
--     MISSING or REJECTED row. Past owed months are unaffected and may be
--     filed in any order. Body otherwise identical to 0079.
--
-- The gate is MEMBER-only and off by default, so with it off — or for a Super
-- Admin — app.member_owed_months is empty and nothing here changes behaviour.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- app.member_owed_submissions(member) — owed months with their status
-- ---------------------------------------------------------------------------
create or replace function app.member_owed_submissions(p_member_id uuid)
returns table (period_month date, status member_submission_status)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mo.owed, ms.status
  from app.member_owed_months(p_member_id) as mo(owed)
  left join submission_periods sp on sp.period_month = mo.owed
  left join member_submissions ms
    on ms.period_id = sp.id and ms.member_id = p_member_id
  order by mo.owed;
$$;

comment on function app.member_owed_submissions(uuid) is
  'Owed submission months for a member with their submission status (NULL = nothing filed). Empty when the gate is off.';

revoke all on function app.member_owed_submissions(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- my_owed_submissions() — the caller's own owed months + status, for the UI
-- ---------------------------------------------------------------------------
create or replace function public.my_owed_submissions()
returns table (period_month date, status member_submission_status)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.period_month, o.status
  from members m
  cross join lateral app.member_owed_submissions(m.id) as o
  where m.user_id = auth.uid() and m.status = 'ACTIVE'
  order by o.period_month;
$$;

comment on function public.my_owed_submissions() is
  'Owed (unconfirmed, closed) submission months for the signed-in member with their status, oldest first. NULL status = nothing filed.';

revoke all on function public.my_owed_submissions() from public, anon;
grant execute on function public.my_owed_submissions() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- submit_material_submission (current body: 0079) — past months first
-- ---------------------------------------------------------------------------
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
  v_unfiled_month date;
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

  -- 0079: per-member quota, before any business read or write.
  perform app.consume_member_action('submission:submit');

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

  -- 0084: the current month waits until every owed month is handed in
  -- (PENDING counts; MISSING and REJECTED do not).
  if v_target_month = v_current_month then
    select min(o.period_month) into v_unfiled_month
    from app.member_owed_submissions(v_member_id) o
    where o.status is distinct from 'PENDING';

    if v_unfiled_month is not null then
      raise exception 'Hand in your % submission first',
        to_char(v_unfiled_month, 'FMMonth YYYY')
        using errcode = 'check_violation';
    end if;
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
