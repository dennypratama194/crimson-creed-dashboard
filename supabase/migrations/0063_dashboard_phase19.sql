-- ============================================================================
-- 0063_dashboard_phase19
-- Phase 19 swapped piece-rate production + payroll for distribution draws and
-- production assignments. Both dashboards are single-round-trip RPCs (0050,
-- 0056), so changing what they show means replacing the function, not adding a
-- query alongside it.
--
--   member_dashboard()  : `earnings` (production payout) -> `distribution`
--                         (what this member still owes on open draws).
--   admin_dashboard()   : `productionToReview` / `draftPayrollRuns` /
--                         `unpaidPayrollTotal` -> `productionUnpaid` /
--                         `openDraws` / `outstandingDebt`.
--
-- Everything else in both payloads is carried over unchanged.
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
  v_draws        jsonb;
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
    'openDraws',     coalesce(count(*) filter (where status = 'OPEN'), 0),
    'openAmount',    coalesce(sum(amount_owed) filter (where status = 'OPEN'), 0),
    'settledDraws',  coalesce(count(*) filter (where status = 'SETTLED'), 0),
    'settledAmount', coalesce(sum(amount_owed) filter (where status = 'SETTLED'), 0)
  )
  into v_draws
  from distributions
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
    'distribution',        v_draws,
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

create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today          date := (now() at time zone 'utc')::date;
  v_period_start   timestamptz := ((v_today - 7)::timestamp at time zone 'utc');
  v_prev_start     timestamptz := ((v_today - 14)::timestamp at time zone 'utc');
  v_trend_start    date := v_today - 89;
  v_month          date := date_trunc('month', v_today)::date;

  v_active_members integer;
  v_new_active_7d  integer;
  v_orders_7d      integer;
  v_orders_prev_7d integer;
  v_completed      integer;
  v_completed_7d   integer;
  v_to_verify      integer;
  v_to_process     integer;
  v_to_distribute  integer;
  v_low_stock      integer;
  v_company_cash   numeric;
  v_cash_net_7d    numeric;
  v_prod_unpaid    integer;
  v_open_draws     integer;
  v_outstanding    numeric;
  v_subs_pending   integer;
  v_subs_confirmed integer;

  v_trend          jsonb;
  v_activity       jsonb;
  v_low_items      jsonb;
  v_recent_orders  jsonb;
begin
  perform app.require_super_admin();

  select
    count(*) filter (where status = 'ACTIVE'),
    count(*) filter (where status = 'ACTIVE' and created_at >= v_period_start)
  into v_active_members, v_new_active_7d
  from members;

  -- One pass over orders for every order counter.
  select
    count(*) filter (where created_at >= v_period_start),
    count(*) filter (where created_at >= v_prev_start and created_at < v_period_start),
    count(*) filter (where status = 'COMPLETED'),
    count(*) filter (where completed_at >= v_period_start),
    count(*) filter (where payment_status = 'PAYMENT_SUBMITTED'),
    count(*) filter (where status = 'PENDING'),
    count(*) filter (
      where status = 'PROCESSING'
        and payment_status = 'PAID'
        and distribution_status = 'NOT_DISTRIBUTED'
    )
  into
    v_orders_7d, v_orders_prev_7d, v_completed, v_completed_7d,
    v_to_verify, v_to_process, v_to_distribute
  from orders;

  -- Stock state mirrors stockState() in src/lib/db/inventory.ts: out when the
  -- quantity is <= 0, low when a positive threshold is reached. Every
  -- non-archived item counts, company stash included. A missing inventory row
  -- is treated as zero stock.
  select count(*)
  into v_low_stock
  from items i
  left join inventory inv on inv.item_id = i.id
  where i.archived_at is null
    and (
      coalesce(inv.current_quantity, 0) <= 0
      or (i.low_stock_threshold > 0
          and coalesce(inv.current_quantity, 0) <= i.low_stock_threshold)
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'current_quantity', s.qty,
        'low_stock_threshold', s.low_stock_threshold
      )
      order by s.name, s.id
    ),
    '[]'::jsonb
  )
  into v_low_items
  from (
    select i.id, i.name, i.low_stock_threshold,
           coalesce(inv.current_quantity, 0) as qty
    from items i
    left join inventory inv on inv.item_id = i.id
    where i.archived_at is null
      and (
        coalesce(inv.current_quantity, 0) <= 0
        or (i.low_stock_threshold > 0
            and coalesce(inv.current_quantity, 0) <= i.low_stock_threshold)
      )
    order by i.name, i.id
    limit 5
  ) s;

  select coalesce((select balance from cash_account where id), 0)
  into v_company_cash;

  select coalesce(
    sum(case when direction = 'IN' then amount else -amount end), 0
  )
  into v_cash_net_7d
  from cash_entries
  where occurred_at >= v_period_start;

  select count(*) into v_prod_unpaid
  from production_assignments
  where status = 'UNPAID';

  select
    count(*) filter (where status = 'OPEN'),
    coalesce(sum(amount_owed) filter (where status = 'OPEN'), 0)
  into v_open_draws, v_outstanding
  from distributions;

  select count(*) into v_subs_pending
  from member_submissions
  where status = 'PENDING';

  select count(*) into v_subs_confirmed
  from member_submissions ms
  join submission_periods sp on sp.id = ms.period_id
  where sp.period_month = v_month
    and ms.status = 'CONFIRMED';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(d.day, 'YYYY-MM-DD'),
        'count', coalesce(c.n, 0)
      )
      order by d.day
    ),
    '[]'::jsonb
  )
  into v_trend
  from generate_series(v_trend_start, v_today, interval '1 day') as d(day)
  left join (
    select (created_at at time zone 'utc')::date as day, count(*)::integer as n
    from orders
    where created_at >= (v_trend_start::timestamp at time zone 'utc')
    group by 1
  ) c on c.day = d.day::date;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'verb', a.verb,
        'summary', a.summary,
        'created_at', a.created_at
      )
      order by a.created_at desc, a.id desc
    ),
    '[]'::jsonb
  )
  into v_activity
  from (
    select id, verb, summary, created_at
    from activity_logs
    order by created_at desc, id desc
    limit 8
  ) a;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'order_number', o.order_number,
        'member_name', o.member_name,
        'created_at', o.created_at,
        'total', o.total,
        'status', o.status,
        'paid_to_name', o.paid_to_name
      )
      order by o.created_at desc, o.id desc
    ),
    '[]'::jsonb
  )
  into v_recent_orders
  from (
    select o.id, o.order_number, o.created_at, o.total, o.status,
           o.paid_to_name,
           coalesce(m.display_name, 'Unknown member') as member_name
    from orders o
    left join members m on m.id = o.member_id
    order by o.created_at desc, o.id desc
    limit 6
  ) o;

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'activeMembers',      v_active_members,
      'newActiveMembers7d', v_new_active_7d,
      'orders7d',           v_orders_7d,
      'ordersPrev7d',       v_orders_prev_7d,
      'completedOrders',    v_completed,
      'completedOrders7d',  v_completed_7d,
      'lowStock',           v_low_stock,
      'companyCash',        v_company_cash,
      'cashNet7d',          v_cash_net_7d
    ),
    'attention', jsonb_build_object(
      'paymentsToVerify',    v_to_verify,
      'toProcess',           v_to_process,
      'toDistribute',        v_to_distribute,
      'productionUnpaid',    v_prod_unpaid,
      'openDraws',           v_open_draws,
      'outstandingDebt',     v_outstanding,
      'submissionsToReview', v_subs_pending,
      'membersNotSubmitted', greatest(0, v_active_members - v_subs_confirmed)
    ),
    'orderTrend',     v_trend,
    'recentActivity', v_activity,
    'lowStockItems',  v_low_items,
    'recentOrders',   v_recent_orders
  );
end;
$$;

revoke all on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated, service_role;
