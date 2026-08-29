-- ============================================================================
-- 0020_production_rpc
-- Atomic SECURITY DEFINER writes for the Production & Payroll module.
-- Payout is ALWAYS computed here (quantity x snapshot rate) — never trusted
-- from the client. Every write leaves an audit + activity row.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- notify every member that appears on a payroll run
-- ---------------------------------------------------------------------------
create or replace function app.notify_payroll_run_members(
  p_run_id uuid,
  p_type notification_type,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (recipient_id, type, title, body, reference_type, reference_id)
  select l.member_id, p_type, p_title, p_body, 'PAYROLL_RUN', p_run_id
  from payroll_run_lines l
  join members m on m.id = l.member_id
  where m.status = 'ACTIVE';
end;
$$;

-- ---------------------------------------------------------------------------
-- set_production_rate  (Super Admin) — upsert the pay rate for a PRODUCT item
-- ---------------------------------------------------------------------------
create or replace function public.set_production_rate(
  p_item_id uuid,
  p_unit_rate numeric
)
returns production_rates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_item  items;
  v_old   production_rates;
  v_rate  production_rates;
begin
  perform app.require_super_admin();

  if p_unit_rate is null or p_unit_rate < 0 then
    raise exception 'A pay rate of zero or more is required' using errcode = 'check_violation';
  end if;

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_item.category <> 'PRODUCT' then
    raise exception 'Only PRODUCT items can carry a production pay rate'
      using errcode = 'check_violation';
  end if;
  if v_item.archived_at is not null then
    raise exception 'Restore this item before setting a pay rate' using errcode = 'check_violation';
  end if;

  select * into v_old from production_rates where item_id = p_item_id;

  insert into production_rates (item_id, unit_rate, updated_by)
  values (p_item_id, p_unit_rate, v_actor)
  on conflict (item_id) do update
    set unit_rate = excluded.unit_rate,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_rate;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'production.rate_set',
    case when v_old.item_id is not null and v_old.unit_rate <> v_rate.unit_rate
         then format('Pay rate for "%s" %s → %s per %s',
                     v_item.name, v_old.unit_rate, v_rate.unit_rate, lower(v_item.unit::text))
         else format('Pay rate for "%s" set to %s per %s',
                     v_item.name, v_rate.unit_rate, lower(v_item.unit::text)) end,
    'ITEM', p_item_id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (
    v_actor, 'PRODUCTION_RATE_SET', 'item', p_item_id,
    case when v_old.item_id is not null then jsonb_build_object('unit_rate', v_old.unit_rate) end,
    jsonb_build_object('unit_rate', v_rate.unit_rate)
  );

  return v_rate;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_production_log  (member) — "I processed N units of X"
-- ---------------------------------------------------------------------------
create or replace function public.submit_production_log(
  p_item_id uuid,
  p_quantity numeric,
  p_occurred_at timestamptz default null,
  p_note text default null
)
returns production_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id   uuid;
  v_member_name text;
  v_item        items;
  v_rate        numeric(14, 2);
  v_occurred    timestamptz := coalesce(p_occurred_at, now());
  v_payout      numeric(14, 2);
  v_log         production_logs;
begin
  select m.id, m.display_name into v_member_id, v_member_name
  from members m
  where m.user_id = auth.uid() and m.status = 'ACTIVE';

  if v_member_id is null then
    raise exception 'Only active members can log production'
      using errcode = 'insufficient_privilege';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero' using errcode = 'check_violation';
  end if;
  if p_quantity > 1000000 then
    raise exception 'That quantity is too large' using errcode = 'check_violation';
  end if;
  if v_occurred > now() + interval '1 day' then
    raise exception 'The date processed cannot be in the future' using errcode = 'check_violation';
  end if;

  select i.* into v_item from items i where i.id = p_item_id;
  if not found then
    raise exception 'That product no longer exists' using errcode = 'foreign_key_violation';
  end if;
  if v_item.archived_at is not null then
    raise exception 'Product "%" is archived', v_item.name using errcode = 'check_violation';
  end if;

  select pr.unit_rate into v_rate from production_rates pr where pr.item_id = p_item_id;
  if v_rate is null then
    raise exception 'Product "%" has no pay rate set yet', v_item.name using errcode = 'check_violation';
  end if;

  v_payout := round(p_quantity * v_rate, 2);

  insert into production_logs (
    member_id, item_id, item_name_snapshot, item_unit_snapshot,
    quantity, unit_rate_snapshot, payout_amount, occurred_at, note
  )
  values (
    v_member_id, p_item_id, v_item.name, v_item.unit,
    p_quantity, v_rate, v_payout, v_occurred, nullif(btrim(p_note), '')
  )
  returning * into v_log;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_member_id, 'production.logged',
    format('%s logged %s %s of %s (%s)',
           v_member_name, v_log.quantity, lower(v_item.unit::text), v_item.name, v_payout),
    'PRODUCTION_LOG', v_log.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_member_id, 'PRODUCTION_LOG_SUBMITTED', 'production_log', v_log.id, to_jsonb(v_log));

  perform app.notify_super_admins(
    'PRODUCTION_LOG_SUBMITTED',
    'Production to review',
    format('%s logged %s %s of %s.',
           v_member_name, v_log.quantity, lower(v_item.unit::text), v_item.name),
    'PRODUCTION_LOG', v_log.id
  );

  return v_log;
end;
$$;

-- ---------------------------------------------------------------------------
-- review_production_log  (Super Admin) — approve or reject a PENDING log
-- ---------------------------------------------------------------------------
create or replace function public.review_production_log(
  p_log_id uuid,
  p_approve boolean,
  p_note text default null
)
returns production_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid := app.current_member_id();
  v_log    production_logs;
  v_status production_log_status;
begin
  perform app.require_super_admin();

  select * into v_log from production_logs where id = p_log_id for update;
  if not found then
    raise exception 'Production log not found' using errcode = 'no_data_found';
  end if;
  if v_log.status <> 'PENDING' then
    raise exception 'This log is already %', lower(v_log.status::text) using errcode = 'check_violation';
  end if;
  if p_approve is null then
    raise exception 'Choose approve or reject' using errcode = 'check_violation';
  end if;
  if not p_approve and coalesce(btrim(p_note), '') = '' then
    raise exception 'A reason is required to reject' using errcode = 'check_violation';
  end if;

  v_status := case when p_approve then 'APPROVED' else 'REJECTED' end::production_log_status;

  update production_logs
  set status = v_status,
      reviewed_by = v_actor,
      reviewed_at = now(),
      review_note = nullif(btrim(p_note), '')
  where id = p_log_id
  returning * into v_log;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor,
    case when p_approve then 'production.approved' else 'production.rejected' end,
    format('%s production log for %s %s of %s',
           case when p_approve then 'Approved' else 'Rejected' end,
           v_log.quantity, lower(v_log.item_unit_snapshot::text), v_log.item_name_snapshot),
    'PRODUCTION_LOG', v_log.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'PRODUCTION_LOG_REVIEWED', 'production_log', v_log.id,
    jsonb_build_object('status', v_status, 'note', nullif(btrim(p_note), ''))
  );

  perform app.notify_member(
    v_log.member_id,
    (case when p_approve then 'PRODUCTION_LOG_APPROVED'
          else 'PRODUCTION_LOG_REJECTED' end)::notification_type,
    case when p_approve then 'Production approved' else 'Production rejected' end,
    case when p_approve
         then format('Your log of %s %s of %s (%s) was approved.',
                     v_log.quantity, lower(v_log.item_unit_snapshot::text),
                     v_log.item_name_snapshot, v_log.payout_amount)
         else coalesce(nullif(btrim(p_note), ''), 'Your production log was rejected.') end,
    'PRODUCTION_LOG', v_log.id
  );

  return v_log;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_production_log  (member: own PENDING only; admin: any PENDING)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_production_log(p_log_id uuid)
returns production_logs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid := app.current_member_id();
  v_is_admin  boolean := app.is_super_admin();
  v_log       production_logs;
begin
  select * into v_log from production_logs where id = p_log_id for update;
  if not found then
    raise exception 'Production log not found' using errcode = 'no_data_found';
  end if;

  if not v_is_admin and v_log.member_id is distinct from v_member_id then
    raise exception 'You can only cancel your own production logs'
      using errcode = 'insufficient_privilege';
  end if;
  if v_log.status <> 'PENDING' then
    raise exception 'Only a pending log can be cancelled' using errcode = 'check_violation';
  end if;

  update production_logs set status = 'CANCELLED' where id = p_log_id returning * into v_log;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    coalesce(v_member_id, v_log.member_id), 'production.cancelled',
    format('Cancelled production log for %s %s of %s',
           v_log.quantity, lower(v_log.item_unit_snapshot::text), v_log.item_name_snapshot),
    'PRODUCTION_LOG', v_log.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    coalesce(v_member_id, v_log.member_id), 'PRODUCTION_LOG_CANCELLED', 'production_log', v_log.id,
    jsonb_build_object('status', 'CANCELLED')
  );

  if not v_is_admin then
    perform app.notify_super_admins(
      'PRODUCTION_LOG_SUBMITTED', 'Production log cancelled',
      'A member cancelled a pending production log.', 'PRODUCTION_LOG', v_log.id
    );
  end if;

  return v_log;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_payroll_run  (Super Admin) — open a DRAFT period
-- ---------------------------------------------------------------------------
create or replace function public.create_payroll_run(
  p_period_start date,
  p_period_end date,
  p_note text default null
)
returns payroll_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_run   payroll_runs;
begin
  perform app.require_super_admin();

  if p_period_start is null or p_period_end is null then
    raise exception 'A start and end date are required' using errcode = 'check_violation';
  end if;
  if p_period_end < p_period_start then
    raise exception 'The end date must be on or after the start date' using errcode = 'check_violation';
  end if;

  insert into payroll_runs (period_start, period_end, note, created_by)
  values (p_period_start, p_period_end, nullif(btrim(p_note), ''), v_actor)
  returning * into v_run;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'payroll.created',
    format('Opened payroll run %s (%s → %s)', v_run.run_number, v_run.period_start, v_run.period_end),
    'PAYROLL_RUN', v_run.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'PAYROLL_RUN_CREATED', 'payroll_run', v_run.id, to_jsonb(v_run));

  return v_run;
end;
$$;

-- ---------------------------------------------------------------------------
-- finalize_payroll_run  (Super Admin) — lock approved logs into per-member lines
-- ---------------------------------------------------------------------------
create or replace function public.finalize_payroll_run(p_run_id uuid)
returns payroll_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_run   payroll_runs;
  v_total numeric(14, 2) := 0;
begin
  perform app.require_super_admin();

  select * into v_run from payroll_runs where id = p_run_id for update;
  if not found then
    raise exception 'Payroll run not found' using errcode = 'no_data_found';
  end if;
  if v_run.status <> 'DRAFT' then
    raise exception 'Only a draft payroll run can be finalized (current: %)', v_run.status
      using errcode = 'check_violation';
  end if;

  insert into payroll_run_lines (
    payroll_run_id, member_id, member_name_snapshot, log_count, gross_amount
  )
  select
    p_run_id,
    l.member_id,
    coalesce(m.display_name, 'Unknown member'),
    count(*)::integer,
    round(sum(l.payout_amount), 2)
  from production_logs l
  left join members m on m.id = l.member_id
  where l.status = 'APPROVED'
    and l.payroll_run_id is null
    and l.occurred_at >= v_run.period_start::timestamptz
    and l.occurred_at < (v_run.period_end + 1)::timestamptz
  group by l.member_id, m.display_name;

  update production_logs
  set payroll_run_id = p_run_id
  where status = 'APPROVED'
    and payroll_run_id is null
    and occurred_at >= v_run.period_start::timestamptz
    and occurred_at < (v_run.period_end + 1)::timestamptz;

  select coalesce(sum(gross_amount), 0) into v_total
  from payroll_run_lines where payroll_run_id = p_run_id;

  update payroll_runs
  set status = 'FINALIZED', total_amount = v_total, finalized_by = v_actor, finalized_at = now()
  where id = p_run_id
  returning * into v_run;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'payroll.finalized',
    format('Finalized payroll run %s — total %s', v_run.run_number, v_total),
    'PAYROLL_RUN', v_run.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'PAYROLL_RUN_FINALIZED', 'payroll_run', v_run.id,
    jsonb_build_object('total_amount', v_total)
  );

  perform app.notify_payroll_run_members(
    v_run.id, 'PAYROLL_FINALIZED', 'Payslip ready',
    format('Payroll run %s is finalized. Check your earnings.', v_run.run_number)
  );

  return v_run;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_payroll_run_paid  (Super Admin) — record the in-game disbursement
-- ---------------------------------------------------------------------------
create or replace function public.mark_payroll_run_paid(p_run_id uuid)
returns payroll_runs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_run   payroll_runs;
begin
  perform app.require_super_admin();

  select * into v_run from payroll_runs where id = p_run_id for update;
  if not found then
    raise exception 'Payroll run not found' using errcode = 'no_data_found';
  end if;
  if v_run.status <> 'FINALIZED' then
    raise exception 'Only a finalized payroll run can be marked paid (current: %)', v_run.status
      using errcode = 'check_violation';
  end if;

  update payroll_runs
  set status = 'PAID', paid_by = v_actor, paid_at = now()
  where id = p_run_id
  returning * into v_run;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'payroll.paid',
    format('Marked payroll run %s paid — %s', v_run.run_number, v_run.total_amount),
    'PAYROLL_RUN', v_run.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (
    v_actor, 'PAYROLL_RUN_PAID', 'payroll_run', v_run.id,
    jsonb_build_object('total_amount', v_run.total_amount)
  );

  perform app.notify_payroll_run_members(
    v_run.id, 'PAYROLL_PAID', 'You have been paid',
    format('Payroll run %s has been paid out in-game.', v_run.run_number)
  );

  return v_run;
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
    'set_production_rate(uuid, numeric)',
    'submit_production_log(uuid, numeric, timestamptz, text)',
    'review_production_log(uuid, boolean, text)',
    'cancel_production_log(uuid)',
    'create_payroll_run(date, date, text)',
    'finalize_payroll_run(uuid)',
    'mark_payroll_run_paid(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
