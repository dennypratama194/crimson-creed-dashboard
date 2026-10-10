-- ============================================================================
-- 0085_member_dashboard_waiting_on
-- Dashboard follow-up to 0084 (past months first).
--
-- While an owed month is still MISSING or REJECTED, submit_material_submission
-- refuses the current month — but the dashboard kept nagging "your <current
-- month> submission is due", which the member cannot act on. member_dashboard()
-- now also returns:
--
--   submissionWaitingOn   'YYYY-MM-DD' of the oldest owed month still to hand
--                         in (MISSING or REJECTED), or null. Null too once the
--                         current month is CONFIRMED. Same predicate as the
--                         0084 check, via app.member_owed_submissions().
--
-- Additive: every existing key keeps its value. submissionDebt now comes from
-- app.member_owed_submissions instead of app.member_owed_months — the same
-- months, in the same order. Body otherwise identical to 0063.
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
  v_waiting      date;
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

  -- 0084/0085: one pass over the owed months gives both the debt list (same
  -- values as before) and the oldest month still to hand in (MISSING or
  -- REJECTED), which holds the current month back. Nothing waits once the
  -- current month is already confirmed.
  select coalesce(jsonb_agg(o.period_month order by o.period_month), '[]'::jsonb),
         min(o.period_month) filter (where o.status is distinct from 'PENDING')
  into v_debt, v_waiting
  from app.member_owed_submissions(v_member_id) o;
  if v_alert = 'CONFIRMED' then
    v_waiting := null;
  end if;

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
    'submissionDebt',      v_debt,
    'submissionWaitingOn', to_char(v_waiting, 'YYYY-MM-DD')
  );
end;
$$;

revoke all on function public.member_dashboard() from public, anon;
grant execute on function public.member_dashboard() to authenticated, service_role;
