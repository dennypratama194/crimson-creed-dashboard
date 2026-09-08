-- ============================================================================
-- 0049_finalize_payroll_run_atomic
-- finalize_payroll_run (0020) read the approved in-range logs in one statement
-- (insert … select) and claimed them in a second (update … set payroll_run_id).
-- Two finalizes over overlapping periods could both read the same logs before
-- either claimed them, double-writing payroll_run_lines.
--
-- Fix: claim first with a single UPDATE … RETURNING, then aggregate only the
-- rows that UPDATE actually took. The row locks make concurrent finalizes
-- serialize; the loser sees payroll_run_id already set and takes nothing.
--
-- Body is otherwise identical to 0020.
-- ============================================================================

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

  -- Claim the logs and roll them up in one statement so nothing can slip in
  -- between the read and the write.
  with claimed as (
    update production_logs
    set payroll_run_id = p_run_id
    where status = 'APPROVED'
      and payroll_run_id is null
      and occurred_at >= v_run.period_start::timestamptz
      and occurred_at < (v_run.period_end + 1)::timestamptz
    returning member_id, payout_amount
  )
  insert into payroll_run_lines (
    payroll_run_id, member_id, member_name_snapshot, log_count, gross_amount
  )
  select
    p_run_id,
    c.member_id,
    coalesce(m.display_name, 'Unknown member'),
    count(*)::integer,
    round(sum(c.payout_amount), 2)
  from claimed c
  left join members m on m.id = c.member_id
  group by c.member_id, m.display_name;

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

revoke all on function public.finalize_payroll_run(uuid) from public, anon;
grant execute on function public.finalize_payroll_run(uuid) to authenticated, service_role;
