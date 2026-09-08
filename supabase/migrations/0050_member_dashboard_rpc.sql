-- ============================================================================
-- 0050_member_dashboard_rpc
-- The member dashboard is the one screen every member loads, and it fired ~9
-- separate PostgREST requests per view. On a login spike (a full org signing in
-- at session start) that is ~9x the request / connection-slot pressure it needs
-- to be.
--
-- member_dashboard() does the same work in one round-trip: all counts + the
-- small row lists (active / recent orders, recent notifications) rolled into a
-- single jsonb payload. RLS-equivalent — every subquery is scoped to the
-- calling member, resolved from auth.uid() the same way the other member RPCs
-- do it. The TS layer keeps computing the period-over-period baseline.
-- ============================================================================

create or replace function public.member_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id    uuid;
  v_month        date := date_trunc('month', current_date)::date;
  v_since        timestamptz := (current_date - interval '7 days');
  v_open         integer;
  v_completed    integer;
  v_completed_7d integer;
  v_unread       integer;
  v_earnings     jsonb;
  v_alert        text;
  v_active       jsonb;
  v_recent       jsonb;
  v_notifs       jsonb;
  v_debt         jsonb;
begin
  select m.id into v_member_id
  from members m
  where m.user_id = auth.uid() and m.status = 'ACTIVE';

  if v_member_id is null then
    raise exception 'Only active members have a dashboard'
      using errcode = 'insufficient_privilege';
  end if;

  select
    count(*) filter (where status in ('PENDING', 'PROCESSING')),
    count(*) filter (where status = 'COMPLETED'),
    count(*) filter (where completed_at >= v_since)
  into v_open, v_completed, v_completed_7d
  from orders
  where member_id = v_member_id;

  select count(*) into v_unread
  from notifications
  where recipient_id = v_member_id and read_at is null;

  select jsonb_build_object(
    'pendingCount',
      coalesce(count(*) filter (where status = 'PENDING'), 0),
    'pendingAmount',
      coalesce(sum(payout_amount) filter (where status = 'PENDING'), 0),
    'approvedUnpaidAmount',
      coalesce(sum(payout_amount)
        filter (where status = 'APPROVED' and payroll_run_id is null), 0),
    'paidAmount',
      coalesce(sum(payout_amount)
        filter (where status = 'APPROVED' and payroll_run_id is not null), 0)
  )
  into v_earnings
  from production_logs
  where member_id = v_member_id;

  -- Current-month submission state, or MISSING when the member has no row (or
  -- the month's period has not been created yet).
  select coalesce(ms.status::text, 'MISSING')
  into v_alert
  from submission_periods sp
  left join member_submissions ms
    on ms.period_id = sp.id and ms.member_id = v_member_id
  where sp.period_month = v_month;
  v_alert := coalesce(v_alert, 'MISSING');

  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
  into v_active
  from (
    select * from orders
    where member_id = v_member_id and status in ('PENDING', 'PROCESSING')
    order by created_at desc
    limit 6
  ) o;

  select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at desc), '[]'::jsonb)
  into v_recent
  from (
    select * from orders
    where member_id = v_member_id
    order by created_at desc
    limit 6
  ) o;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
  into v_notifs
  from (
    select * from notifications
    where recipient_id = v_member_id
    order by created_at desc
    limit 5
  ) n;

  select coalesce(jsonb_agg(d order by d), '[]'::jsonb)
  into v_debt
  from app.member_owed_months(v_member_id) d;

  return jsonb_build_object(
    'open',                v_open,
    'completed',           v_completed,
    'completed7d',         v_completed_7d,
    'unread',              v_unread,
    'earnings',            v_earnings,
    'submissionState',     v_alert,
    'periodMonth',         to_char(v_month, 'YYYY-MM-DD'),
    'activeOrders',        v_active,
    'recentOrders',        v_recent,
    'recentNotifications', v_notifs,
    'submissionDebt',      v_debt
  );
end;
$$;

revoke all on function public.member_dashboard() from public, anon;
grant execute on function public.member_dashboard() to authenticated, service_role;
