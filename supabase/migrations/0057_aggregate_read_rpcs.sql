-- ============================================================================
-- 0057_aggregate_read_rpcs
-- Moves four JavaScript aggregations into SQL. Each previously pulled raw rows
-- over PostgREST and summed / grouped / joined them in the Next.js server:
--
--   cash_summary(from, to)       <- getCashSummary()        (every entry row)
--   my_earnings_summary()        <- getMyEarningsSummary()  (every log row)
--   my_payslips()                <- listMyPayslips()        (2 queries + join)
--   member_order_counts(ids[])   <- listMembers()           (every order row)
--
-- Authorization (all SECURITY DEFINER, all self-gating, no trusted input):
--   * cash_summary / member_order_counts: app.require_super_admin() first —
--     the same boundary as the Super-Admin-only RLS on cash_entries / orders.
--   * my_earnings_summary / my_payslips: the member is resolved from auth.uid()
--     (ACTIVE only) and every row is filtered to that member. This is stricter
--     than the TS it replaces, which leaned on RLS alone — and RLS shows a
--     Super Admin every member's logs and payslip lines, so a Super Admin's
--     /production page summed the whole organisation. It now shows their own.
--
-- Additive only: new functions, no table / policy / existing-RPC changes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- cash_summary — income / expense totals over an optional [from, to) window
-- ---------------------------------------------------------------------------
create or replace function public.cash_summary(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_income  numeric;
  v_expense numeric;
  v_count   integer;
begin
  perform app.require_super_admin();

  select
    coalesce(sum(amount) filter (where direction = 'IN'), 0),
    coalesce(sum(amount) filter (where direction = 'OUT'), 0),
    count(*)
  into v_income, v_expense, v_count
  from cash_entries
  where (p_from is null or occurred_at >= p_from)
    and (p_to is null or occurred_at < p_to);

  return jsonb_build_object(
    'incomeTotal',  v_income,
    'expenseTotal', v_expense,
    'net',          round(v_income - v_expense, 2),
    'entryCount',   v_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- my_earnings_summary — money-at-a-glance for the calling member only
-- ---------------------------------------------------------------------------
create or replace function public.my_earnings_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid;
  v_result    jsonb;
begin
  select m.id into v_member_id
  from members m
  where m.user_id = auth.uid() and m.status = 'ACTIVE';

  if v_member_id is null then
    raise exception 'Only active members have earnings'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'pendingCount',
      count(*) filter (where status = 'PENDING'),
    'pendingAmount',
      coalesce(sum(payout_amount) filter (where status = 'PENDING'), 0),
    'approvedUnpaidAmount',
      coalesce(sum(payout_amount)
        filter (where status = 'APPROVED' and payroll_run_id is null), 0),
    'paidAmount',
      coalesce(sum(payout_amount)
        filter (where status = 'APPROVED' and payroll_run_id is not null), 0)
  )
  into v_result
  from production_logs
  where member_id = v_member_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_payslips — the calling member's payroll lines with their run header
-- ---------------------------------------------------------------------------
create or replace function public.my_payslips()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid;
  v_result    jsonb;
begin
  select m.id into v_member_id
  from members m
  where m.user_id = auth.uid() and m.status = 'ACTIVE';

  if v_member_id is null then
    raise exception 'Only active members have payslips'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(l) || jsonb_build_object(
        'run_number',   r.run_number,
        'period_start', r.period_start,
        'period_end',   r.period_end,
        'run_status',   r.status
      )
      order by l.created_at desc, l.id desc
    ),
    '[]'::jsonb
  )
  into v_result
  from payroll_run_lines l
  join payroll_runs r on r.id = l.payroll_run_id
  where l.member_id = v_member_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- member_order_counts — order count per member, for one page of the member list
-- ---------------------------------------------------------------------------
create or replace function public.member_order_counts(p_member_ids uuid[])
returns table (member_id uuid, order_count integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_super_admin();

  return query
    select o.member_id, count(*)::integer
    from orders o
    where o.member_id = any (coalesce(p_member_ids, '{}'::uuid[]))
    group by o.member_id;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'cash_summary(timestamptz, timestamptz)',
    'my_earnings_summary()',
    'my_payslips()',
    'member_order_counts(uuid[])'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
