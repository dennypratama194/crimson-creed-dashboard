-- ============================================================================
-- 0045_submission_order_gate
-- Phase 17b — the monthly-material submission order gate.
--
-- A member who does not have a CONFIRMED monthly material submission for a
-- CLOSED month (from an org-wide start month onward) cannot place orders until
-- every such month is confirmed. The current month never blocks. MISSING,
-- PENDING and REJECTED all count as owed — only a CONFIRMED submission clears
-- a month (strict, agreed in 17b).
--
-- Ships inert: submission_gate_enabled defaults false. A Super Admin turns it
-- on and picks the reach-back month with set_submission_gate().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- settings: the toggle + how far back the obligation reaches
-- ---------------------------------------------------------------------------
-- Idempotent: one environment had these columns added by hand before this
-- migration was ever recorded, so a plain ADD COLUMN aborted the whole push.
alter table organization_settings
  add column if not exists submission_gate_enabled boolean not null default false,
  add column if not exists submission_obligation_start_month date;

-- No ADD CONSTRAINT IF NOT EXISTS in Postgres; drop-then-add is the equivalent.
alter table organization_settings
  drop constraint if exists organization_settings_start_month_first_of_month;

alter table organization_settings
  add constraint organization_settings_start_month_first_of_month
    check (
      submission_obligation_start_month is null
      or date_trunc('month', submission_obligation_start_month)
         = submission_obligation_start_month
    );

comment on column organization_settings.submission_gate_enabled is
  'Phase 17b: when true, a member owing a CONFIRMED monthly submission for a closed month cannot place orders.';
comment on column organization_settings.submission_obligation_start_month is
  'First month (always the 1st) the submission gate reaches back to. NULL leaves the gate inert whatever the flag says.';

-- ---------------------------------------------------------------------------
-- app.member_owed_months(member) — closed months with no CONFIRMED submission
-- ---------------------------------------------------------------------------
create or replace function app.member_owed_months(p_member_id uuid)
returns setof date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cfg as (
    select submission_gate_enabled            as enabled,
           submission_obligation_start_month  as start_month
    from organization_settings
    where id = true
  ),
  mbr as (
    select created_at, role, status
    from members
    where id = p_member_id
  ),
  bounds as (
    select
      greatest(
        (select start_month from cfg),
        date_trunc('month', (select created_at from mbr))::date
      ) as first_month,
      (date_trunc('month', current_date) - interval '1 month')::date as last_month
  )
  select gs::date
  from cfg, bounds,
       generate_series(bounds.first_month, bounds.last_month, interval '1 month') gs
  where cfg.enabled
    and cfg.start_month is not null
    and (select role from mbr) = 'MEMBER'
    and (select status from mbr) = 'ACTIVE'
    and not exists (
      select 1
      from member_submissions ms
      join submission_periods sp on sp.id = ms.period_id
      where ms.member_id = p_member_id
        and sp.period_month = gs::date
        and ms.status = 'CONFIRMED'
    );
$$;

comment on function app.member_owed_months(uuid) is
  'Closed months (start month .. previous month) with no CONFIRMED material submission for the member. Empty when the gate is off.';

revoke all on function app.member_owed_months(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- my_submission_debt() — the caller''s own owed months, for the app UI
-- ---------------------------------------------------------------------------
create or replace function public.my_submission_debt()
returns setof date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select owed
  from members m
  cross join lateral app.member_owed_months(m.id) as owed
  where m.user_id = auth.uid() and m.status = 'ACTIVE';
$$;

comment on function public.my_submission_debt() is
  'Owed (unconfirmed, closed) submission months for the signed-in member, oldest first when ordered by the caller.';

revoke all on function public.my_submission_debt() from public, anon;
grant execute on function public.my_submission_debt() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_submission_gate  (Super Admin) — flip the toggle / set the start month
-- ---------------------------------------------------------------------------
create or replace function public.set_submission_gate(
  p_enabled     boolean,
  p_start_month date default null
)
returns organization_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_old   organization_settings;
  v_new   organization_settings;
  v_start date;
begin
  perform app.require_super_admin();

  select * into v_old from organization_settings where id = true;

  v_start := case
    when p_start_month is null then v_old.submission_obligation_start_month
    else date_trunc('month', p_start_month)::date
  end;

  if p_enabled and v_start is null then
    raise exception 'Pick the month the gate should start from'
      using errcode = 'check_violation';
  end if;
  if v_start is not null
     and v_start > date_trunc('month', current_date)::date then
    raise exception 'The start month cannot be in the future'
      using errcode = 'check_violation';
  end if;

  update organization_settings
  set submission_gate_enabled = p_enabled,
      submission_obligation_start_month = v_start,
      updated_by = v_actor
  where id = true
  returning * into v_new;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'settings.updated',
    format('%s the material submission order gate%s',
           case when p_enabled then 'Enabled' else 'Disabled' end,
           case when v_start is not null
                then ' (from ' || to_char(v_start, 'Mon YYYY') || ')'
                else '' end),
    'MANUAL', null
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (
    v_actor, 'SETTINGS_UPDATED', 'organization_settings', null,
    jsonb_build_object(
      'submission_gate_enabled', v_old.submission_gate_enabled,
      'submission_obligation_start_month', v_old.submission_obligation_start_month
    ),
    jsonb_build_object(
      'submission_gate_enabled', v_new.submission_gate_enabled,
      'submission_obligation_start_month', v_new.submission_obligation_start_month
    )
  );

  return v_new;
end;
$$;

revoke all on function public.set_submission_gate(boolean, date) from public, anon;
grant execute on function public.set_submission_gate(boolean, date)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_order — now refuses while the member owes a submission month
-- (full body re-declared; only the owed-months guard below is new)
-- ---------------------------------------------------------------------------
create or replace function public.create_order(p_items jsonb, p_note text default null)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id  uuid;
  v_member_name text;
  v_order      orders;
  v_line       record;
  v_subtotal   numeric(14, 2) := 0;
  v_lines      integer := 0;
  v_owed       text;
begin
  select m.id, m.display_name into v_member_id, v_member_name
  from members m
  where m.user_id = auth.uid() and m.status = 'ACTIVE';

  if v_member_id is null then
    raise exception 'Only active members can create orders'
      using errcode = 'insufficient_privilege';
  end if;

  select string_agg(to_char(mo, 'Mon YYYY'), ', ' order by mo)
  into v_owed
  from app.member_owed_months(v_member_id) mo;

  if v_owed is not null then
    raise exception
      'Hand in your monthly materials for % and wait for confirmation before ordering.', v_owed
      using errcode = 'check_violation';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must contain at least one item'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where (e->>'item_id') is null
       or (e->>'quantity') is null
       or (e->>'quantity') !~ '^-?\d+$'
       or (e->>'quantity')::integer <= 0
  ) then
    raise exception 'Every line needs an item and a whole quantity greater than zero'
      using errcode = 'check_violation';
  end if;

  insert into orders (member_id, note)
  values (v_member_id, nullif(btrim(p_note), ''))
  returning * into v_order;

  for v_line in
    select agg.item_id,
           agg.quantity,
           i.name,
           i.unit,
           i.price,
           i.active,
           i.orderable,
           i.archived_at
    from (
      select (e->>'item_id')::uuid as item_id,
             sum((e->>'quantity')::integer) as quantity
      from jsonb_array_elements(p_items) e
      group by (e->>'item_id')::uuid
    ) agg
    left join items i on i.id = agg.item_id
  loop
    if v_line.name is null then
      raise exception 'One of the ordered items no longer exists'
        using errcode = 'foreign_key_violation';
    end if;
    if v_line.archived_at is not null or not v_line.active or not v_line.orderable then
      raise exception 'Item "%" is not available to order', v_line.name
        using errcode = 'check_violation';
    end if;

    insert into order_items (
      order_id, item_id, item_name_snapshot, item_unit_snapshot,
      unit_price_snapshot, quantity, line_total
    )
    values (
      v_order.id, v_line.item_id, v_line.name, v_line.unit,
      v_line.price, v_line.quantity, round(v_line.price * v_line.quantity, 2)
    );

    v_subtotal := v_subtotal + round(v_line.price * v_line.quantity, 2);
    v_lines := v_lines + 1;
  end loop;

  update orders
  set subtotal = v_subtotal, total = v_subtotal
  where id = v_order.id
  returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id, metadata)
  values (
    v_order.id, 'ORDER_CREATED',
    format('Order %s created — %s line item(s), total %s',
           v_order.order_number, v_lines, v_subtotal),
    v_member_id,
    jsonb_build_object('total', v_subtotal, 'lines', v_lines)
  );

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_member_id, 'order.created',
    format('%s placed order %s', v_member_name, v_order.order_number),
    'ORDER', v_order.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_member_id, 'ORDER_CREATED', 'order', v_order.id, to_jsonb(v_order));

  perform app.notify_super_admins(
    'ORDER_CREATED',
    format('New order %s', v_order.order_number),
    format('%s placed an order totalling %s', v_member_name, v_subtotal),
    'ORDER', v_order.id
  );

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_material_submission — gains an optional target month so a member can
-- clear a debt month. NULL keeps today's behaviour (current month only). A
-- past month is accepted only while it is genuinely owed (app.member_owed_months
-- already excludes months before the start month and months already CONFIRMED).
-- The 2-arg form is dropped so callers resolve unambiguously to the new one.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_material_submission(jsonb, text);

create or replace function public.submit_material_submission(
  p_lines        jsonb,
  p_note         text default null,
  p_period_month date default null
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

revoke all on function public.submit_material_submission(jsonb, text, date) from public, anon;
grant execute on function public.submit_material_submission(jsonb, text, date)
  to authenticated, service_role;
