-- ============================================================================
-- 0056_admin_dashboard_rpc
-- The admin dashboard fired ~22 PostgREST requests per view (counts, three
-- helper modules, a full inventory load and a 90-day order pull bucketed in
-- JavaScript). admin_dashboard() returns the same data in one round-trip.
--
-- Authorization: SECURITY DEFINER, so it must gate itself — the first statement
-- is app.require_super_admin(), which resolves the caller from auth.uid() and
-- raises insufficient_privilege for anyone but an ACTIVE Super Admin. It takes
-- no arguments, so there is no browser-supplied identity or role to trust.
--
-- Time windows are UTC, matching the TypeScript it replaces: "this period" is
-- [UTC midnight 7 days ago, now), "previous period" the 7 days before that, and
-- the trend is one bucket per UTC day for the last 90 days (today included).
-- Previous-period baselines for running totals are returned as the amount that
-- accrued inside this period; the TS layer derives the percentage deltas.
--
-- Additive only: a new function, no table / policy / existing-RPC changes.
-- ============================================================================

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
  v_prod_pending   integer;
  v_draft_runs     integer;
  v_unpaid_payroll numeric;
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

  select count(*) into v_prod_pending
  from production_logs
  where status = 'PENDING';

  select
    count(*) filter (where status = 'DRAFT'),
    coalesce(sum(total_amount) filter (where status = 'FINALIZED'), 0)
  into v_draft_runs, v_unpaid_payroll
  from payroll_runs;

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
      'productionToReview',  v_prod_pending,
      'draftPayrollRuns',    v_draft_runs,
      'unpaidPayrollTotal',  v_unpaid_payroll,
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
