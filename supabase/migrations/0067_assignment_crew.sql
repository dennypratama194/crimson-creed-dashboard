-- ============================================================================
-- 0067_assignment_crew
-- A production job is ONE assignment with a crew inside it, not one row per
-- person. 0065 raised N rows for N members, which read as N unrelated jobs on
-- the board. This splits the two ideas apart:
--
--   production_assignments          - the job: product, quantity, note.
--   production_assignment_members   - the crew: one line per person, each with
--                                     its own UNPAID / PAID flag, so a member
--                                     is marked paid without touching the rest.
--
-- The job's `status` is a ROLLUP kept in sync by app.sync_assignment_status():
-- PAID once every crew line is paid, UNPAID while any line is not, and
-- CANCELLED is terminal and never recomputed. Keeping it on the row means the
-- board's filters, counts and the admin dashboard tile stay simple reads.
--
-- Safe to apply whether or not 0065 ever ran: existing assignments are
-- backfilled into the new table before `member_id` is dropped.
-- ============================================================================

create table production_assignment_members (
  id                    uuid primary key default gen_random_uuid(),
  assignment_id         uuid not null
                          references production_assignments (id) on delete cascade,
  member_id             uuid not null references members (id) on delete restrict,
  member_name_snapshot  text not null,
  status                production_assignment_status not null default 'UNPAID',
  paid_by               uuid references members (id) on delete set null,
  paid_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint production_assignment_members_unique unique (assignment_id, member_id),
  -- CANCELLED belongs to the job, never to one person on it.
  constraint production_assignment_members_status
    check (status in ('UNPAID', 'PAID'))
);

create index production_assignment_members_assignment_idx
  on production_assignment_members (assignment_id);
create index production_assignment_members_member_idx
  on production_assignment_members (member_id);

create trigger production_assignment_members_set_updated_at
  before update on production_assignment_members
  for each row execute function app.set_updated_at();

-- ── backfill the existing one-member-per-row assignments ───────────────────
insert into production_assignment_members (
  assignment_id, member_id, member_name_snapshot, status, paid_by, paid_at,
  created_at
)
select a.id,
       a.member_id,
       coalesce(m.display_name, 'Unknown member'),
       case when a.status = 'PAID' then 'PAID' else 'UNPAID' end
         ::production_assignment_status,
       a.paid_by,
       a.paid_at,
       a.created_at
from production_assignments a
left join members m on m.id = a.member_id;

-- The old select policy reads member_id, so it has to go before the column.
drop policy if exists production_assignments_select on production_assignments;

alter table production_assignments
  drop column member_id,
  drop column paid_by,
  drop column paid_at;

drop index if exists production_assignments_member_id_idx;

comment on table production_assignment_members is
  'The crew on one production job. Each line carries its own paid flag.';
comment on column production_assignments.status is
  'Rollup of the crew lines: PAID only when every member is paid. CANCELLED is terminal. Bookkeeping only — posts nothing to company cash.';

-- ── rollup helper ─────────────────────────────────────────────────────────
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
  from production_assignments where id = p_assignment_id;

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

-- ── RLS ───────────────────────────────────────────────────────────────────
-- A member reaches a job through their own crew line, and sees only that line
-- — never a crewmate's name or whether the crewmate has been paid.
alter table production_assignment_members enable row level security;
revoke all on table production_assignment_members from authenticated, anon;
grant select on table production_assignment_members to authenticated;

create policy production_assignment_members_select on production_assignment_members
  for select to authenticated
  using (app.is_super_admin() or member_id = app.current_member_id());

create policy production_assignments_select on production_assignments
  for select to authenticated
  using (
    app.is_super_admin()
    or exists (
      select 1 from production_assignment_members l
      where l.assignment_id = production_assignments.id
        and l.member_id = app.current_member_id()
    )
  );

-- ── RPCs ──────────────────────────────────────────────────────────────────
-- The old shapes referenced the dropped member_id column.
drop function if exists public.create_production_assignment(uuid, uuid, numeric, text);
drop function if exists public.create_production_assignments(uuid[], uuid, numeric, text);
drop function if exists public.set_production_assignment_paid(uuid, boolean);

-- create_production_assignment  (Super Admin) — one job, a crew of one or more.
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

-- set_assignment_member_paid  (Super Admin) — flip ONE person on the job.
-- Bookkeeping only; posts nothing to company cash.
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
  v_actor uuid := app.current_member_id();
  v_line  production_assignment_members;
  v_job   production_assignments;
  v_was   production_assignment_status;
begin
  perform app.require_super_admin();

  if p_paid is null then
    raise exception 'A paid state is required' using errcode = 'check_violation';
  end if;

  select * into v_line from production_assignment_members
  where id = p_line_id for update;
  if not found then
    raise exception 'That person is not on this assignment' using errcode = 'no_data_found';
  end if;

  select * into v_job from production_assignments where id = v_line.assignment_id;
  if v_job.status = 'CANCELLED' then
    raise exception 'A cancelled assignment cannot be marked paid'
      using errcode = 'check_violation';
  end if;

  v_was := v_line.status;

  update production_assignment_members
  set status  = case when p_paid then 'PAID' else 'UNPAID' end::production_assignment_status,
      paid_by = case when p_paid then v_actor else null end,
      paid_at = case when p_paid then now() else null end
  where id = p_line_id
  returning * into v_line;

  perform app.sync_assignment_status(v_line.assignment_id);

  if v_was = v_line.status then
    return v_line;
  end if;

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

-- set_production_assignment_paid  (Super Admin) — flip the WHOLE crew at once.
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
  v_line production_assignment_members;
  v_job  production_assignments;
begin
  perform app.require_super_admin();

  select * into v_job from production_assignments where id = p_assignment_id;
  if not found then
    raise exception 'Assignment not found' using errcode = 'no_data_found';
  end if;
  if v_job.status = 'CANCELLED' then
    raise exception 'A cancelled assignment cannot be marked paid'
      using errcode = 'check_violation';
  end if;

  for v_line in
    select * from production_assignment_members
    where assignment_id = p_assignment_id
      and status is distinct from
          (case when p_paid then 'PAID' else 'UNPAID' end)::production_assignment_status
  loop
    perform public.set_assignment_member_paid(v_line.id, p_paid);
  end loop;

  select * into v_job from production_assignments where id = p_assignment_id;
  return v_job;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_production_assignment(uuid[], uuid, numeric, text)',
    'set_assignment_member_paid(uuid, boolean)',
    'set_production_assignment_paid(uuid, boolean)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
