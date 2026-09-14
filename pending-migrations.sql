-- ============================================================================
-- !!! SUPERSEDED — DO NOT RUN !!!
-- One-off catch-up script (September 2026) that bundled 0046 → 0052 for a
-- single paste into the production SQL editor. Those migrations live in
-- supabase/migrations/ and production has since moved on to 0053+. Running this
-- again re-applies old function bodies outside the migration history and then
-- fails on the schema_migrations insert at the bottom. Kept as a record only —
-- use `supabase db push` (see DEPLOYMENT.md → Migration rules).
-- ============================================================================
--
-- pending-migrations.sql  —  applies migrations 0046 → 0051
--
-- Idempotent: safe to run against a database that already has some of 0046
-- (as this one does), and safe to re-run if a later statement fails.
-- Run the whole file once in the Supabase SQL editor.
-- ============================================================================


-- ####################  0046_text_length_guards  ####################
-- CHECK constraints have no ADD ... IF NOT EXISTS, so each is dropped first.

alter table members drop constraint if exists members_display_name_max_len;
alter table members add constraint members_display_name_max_len
  check (length(display_name) <= 80) not valid;

alter table orders
  drop constraint if exists orders_note_max_len,
  drop constraint if exists orders_payment_note_max_len,
  drop constraint if exists orders_distribution_note_max_len,
  drop constraint if exists orders_cancel_reason_max_len;
alter table orders
  add constraint orders_note_max_len
    check (note is null or length(note) <= 1000) not valid,
  add constraint orders_payment_note_max_len
    check (payment_note is null or length(payment_note) <= 1000) not valid,
  add constraint orders_distribution_note_max_len
    check (distribution_note is null or length(distribution_note) <= 1000) not valid,
  add constraint orders_cancel_reason_max_len
    check (cancel_reason is null or length(cancel_reason) <= 1000) not valid;

alter table production_logs
  drop constraint if exists production_logs_note_max_len,
  drop constraint if exists production_logs_review_note_max_len;
alter table production_logs
  add constraint production_logs_note_max_len
    check (note is null or length(note) <= 1000) not valid,
  add constraint production_logs_review_note_max_len
    check (review_note is null or length(review_note) <= 1000) not valid;

alter table member_submissions
  drop constraint if exists member_submissions_note_max_len,
  drop constraint if exists member_submissions_review_note_max_len;
alter table member_submissions
  add constraint member_submissions_note_max_len
    check (note is null or length(note) <= 1000) not valid,
  add constraint member_submissions_review_note_max_len
    check (review_note is null or length(review_note) <= 1000) not valid;

alter table cash_entries drop constraint if exists cash_entries_note_max_len;
alter table cash_entries add constraint cash_entries_note_max_len
  check (note is null or length(note) <= 2000) not valid;

alter table items
  drop constraint if exists items_description_max_len,
  drop constraint if exists items_sku_max_len,
  drop constraint if exists items_image_url_max_len;
alter table items
  add constraint items_description_max_len
    check (description is null or length(description) <= 4000) not valid,
  add constraint items_sku_max_len
    check (sku is null or length(sku) <= 100) not valid,
  add constraint items_image_url_max_len
    check (image_url is null or length(image_url) <= 2000) not valid;

alter table suppliers
  drop constraint if exists suppliers_name_max_len,
  drop constraint if exists suppliers_contact_max_len,
  drop constraint if exists suppliers_notes_max_len;
alter table suppliers
  add constraint suppliers_name_max_len
    check (length(name) <= 300) not valid,
  add constraint suppliers_contact_max_len
    check (contact is null or length(contact) <= 300) not valid,
  add constraint suppliers_notes_max_len
    check (notes is null or length(notes) <= 4000) not valid;

alter table relations
  drop constraint if exists relations_name_max_len,
  drop constraint if exists relations_notes_max_len;
alter table relations
  add constraint relations_name_max_len
    check (length(name) <= 300) not valid,
  add constraint relations_notes_max_len
    check (notes is null or length(notes) <= 4000) not valid;

alter table organization_settings
  drop constraint if exists organization_settings_org_name_max_len,
  drop constraint if exists organization_settings_logo_url_max_len;
alter table organization_settings
  add constraint organization_settings_org_name_max_len
    check (length(org_name) <= 200) not valid,
  add constraint organization_settings_logo_url_max_len
    check (logo_url is null or length(logo_url) <= 2000) not valid;



-- ####################  0047_auth_throttle_gc  ####################

-- ============================================================================
-- 0047_auth_throttle_gc
-- `auth_throttle` (0022) only ever loses rows on a successful sign-in
-- (clear_auth_throttle). Every unique IP / username that ever hit a limited
-- endpoint leaves a row behind forever. Rows are tiny, but there is no reason
-- to keep a counter whose window closed hours ago.
--
-- No pg_cron dependency: hit_auth_throttle sweeps opportunistically on ~1% of
-- calls, deleting counters that are well past their window and not actively
-- blocking. The body is otherwise identical to 0022.
-- ============================================================================

create or replace function hit_auth_throttle(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer,
  p_block_seconds  integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r       auth_throttle;
  now_ts  timestamptz := now();
begin
  -- Opportunistic garbage collection. Cheap on average, keeps the table from
  -- growing without bound between deploys.
  if random() < 0.01 then
    delete from auth_throttle
    where (blocked_until is null or blocked_until < now_ts - interval '1 hour')
      and first_attempt_at < now_ts - interval '1 hour';
  end if;

  select * into r from auth_throttle where key = p_key for update;

  if not found then
    insert into auth_throttle (key, attempts, first_attempt_at)
      values (p_key, 1, now_ts);
    return 0;
  end if;

  if r.blocked_until is not null and r.blocked_until > now_ts then
    return ceil(extract(epoch from (r.blocked_until - now_ts)))::integer;
  end if;

  -- Window elapsed since the first attempt in this bucket → start a new one.
  if r.first_attempt_at < now_ts - make_interval(secs => p_window_seconds) then
    update auth_throttle
      set attempts = 1, first_attempt_at = now_ts, blocked_until = null
      where key = p_key;
    return 0;
  end if;

  if r.attempts + 1 > p_limit then
    update auth_throttle
      set attempts = r.attempts + 1,
          blocked_until = now_ts + make_interval(secs => p_block_seconds)
      where key = p_key;
    return p_block_seconds;
  end if;

  update auth_throttle set attempts = r.attempts + 1 where key = p_key;
  return 0;
end;
$$;

revoke all on function hit_auth_throttle(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function hit_auth_throttle(text, integer, integer, integer)
  to service_role;


-- ####################  0048_create_production_product  ####################

-- ============================================================================
-- 0048_create_production_product
-- A "production product" is a PRODUCT-category catalogue item plus a pay rate.
-- The admin action created the two in separate RPC calls, so a failure on the
-- second left an orphan zero-rate item behind. This wraps both in one
-- SECURITY DEFINER function → one transaction: if the rate insert fails, the
-- item creation rolls back with it.
--
-- Delegates to the existing create_item / set_production_rate RPCs (each still
-- re-checks Super Admin and writes its own audit + activity rows).
-- ============================================================================

create or replace function public.create_production_product(
  p_name      text,
  p_unit      item_unit,
  p_unit_rate numeric
)
returns production_rates
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item items;
  v_rate production_rates;
begin
  perform app.require_super_admin();

  -- Not orderable, zero price, catalogue stock type — the Items page manages
  -- those later if the org also sells it.
  v_item := public.create_item(
    p_name, 'PRODUCT'::item_category, p_unit, 0,
    null, null, 0, false, true, null, 'CATALOGUE'::stock_type
  );

  v_rate := public.set_production_rate(v_item.id, p_unit_rate);

  return v_rate;
end;
$$;

revoke all on function public.create_production_product(text, item_unit, numeric)
  from public, anon;
grant execute on function public.create_production_product(text, item_unit, numeric)
  to authenticated, service_role;


-- ####################  0049_finalize_payroll_run_atomic  ####################

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


-- ####################  0050_member_dashboard_rpc  ####################

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


-- ####################  0051_relation_details  ####################

-- ============================================================================
-- 0051_relation_details
-- Extends the Relations directory (0043–0044) to match the working roster sheet
-- and wires the metal-scrap prerequisite into the company stash.
--
--   New columns on `relations`:
--     • handler_member_id   — the member responsible ("PJ" on the sheet)
--     • metal_scrap_settled — has the metal-scrap due been settled ("lunas")
--     • oath_date           — date the oath was taken, if any
--     • blood_oath          — blood oath taken
--
--   Metal-scrap hookup:
--     • Every relation owes a FIXED 250 of Metal Scrap — the same stash item the
--       monthly Material Submissions post to (submission_material_types.code='MS').
--     • metal_scrap_settled false→true posts +250; true→false posts −250 to
--       reverse. Recorded as movement_type='ADJUSTMENT' with
--       reference_type='RELATION' (no new enum value needed — keeps this to one
--       migration; the note + reference identify it). Never a direct edit to
--       inventory.current_quantity. Mirrors confirm/reject in 0034_submissions_rpc.
--     • One-time backfill at the end for relations already marked settled.
--
--   Metal Scrap is counted in pieces, not weight: its unit moves KILOGRAM → UNIT
--   here (UNIT renders as "pcs" — src/lib/constants/labels.ts).
--
-- Written idempotent (IF NOT EXISTS / OR REPLACE / guarded backfill) so it is
-- safe to re-apply against a database where a prior run got part-way.
-- Still Super Admin only. RPC arg lists grow (trailing, defaulted).
-- ============================================================================

alter table relations add column if not exists handler_member_id   uuid references members (id) on delete set null;
alter table relations add column if not exists metal_scrap_settled boolean not null default false;
alter table relations add column if not exists oath_date           date;
alter table relations add column if not exists blood_oath          boolean not null default false;

comment on column relations.handler_member_id is 'Member responsible for this relation (the "PJ" on the roster sheet). Null = unassigned.';
comment on column relations.metal_scrap_settled is 'Metal-scrap prerequisite (250 pcs) settled ("lunas"). Toggling posts/reverses stock.';
comment on column relations.oath_date is 'Date the oath was taken, if recorded.';
comment on column relations.blood_oath is 'Blood oath taken.';

create index if not exists relations_handler_member_id_idx
  on relations (handler_member_id)
  where handler_member_id is not null;

-- ── Metal Scrap is a piece count, not a weight ──────────────────────────────
update items set unit = 'UNIT'::item_unit
where id = (select inventory_item_id from submission_material_types where code = 'MS')
  and unit <> 'UNIT';

update submission_material_types set unit = 'UNIT'::item_unit
where code = 'MS' and unit <> 'UNIT';

-- ---------------------------------------------------------------------------
-- app.metal_scrap_item_id  (internal) — the canonical Metal Scrap stash item
-- ---------------------------------------------------------------------------
create or replace function app.metal_scrap_item_id()
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select inventory_item_id from submission_material_types where code = 'MS';
$$;

-- ---------------------------------------------------------------------------
-- app.apply_relation_metal_scrap  (internal) — post the signed 250 delta for a
-- change in a relation's settled flag. No-op when the flag did not change.
-- ---------------------------------------------------------------------------
create or replace function app.apply_relation_metal_scrap(
  p_relation_id uuid,
  p_was_settled boolean,
  p_now_settled boolean,
  p_actor       uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_qty     constant integer := 250;
  v_item_id uuid := app.metal_scrap_item_id();
  v_delta   integer;
begin
  if coalesce(p_was_settled, false) = coalesce(p_now_settled, false) then
    return;
  end if;
  if v_item_id is null then
    raise exception 'Metal Scrap stash item is missing' using errcode = 'no_data_found';
  end if;

  v_delta := case when coalesce(p_now_settled, false) then v_qty else -v_qty end;

  insert into inventory_movements (
    item_id, quantity, movement_type, reference_type, reference_id, performed_by, notes
  )
  values (
    v_item_id, v_delta, 'ADJUSTMENT', 'RELATION', p_relation_id, p_actor,
    case when v_delta > 0
         then 'Relation metal scrap prerequisite settled'
         else 'Relation metal scrap prerequisite reopened — stock reversed' end
  );

  insert into inventory (item_id, current_quantity, updated_at)
  values (v_item_id, v_delta, now())
  on conflict (item_id) do update
    set current_quantity = inventory.current_quantity + v_delta,
        updated_at = now();

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    p_actor, 'relation.metal_scrap',
    case when v_delta > 0
         then 'Added 250 pcs Metal Scrap to the stash (relation prerequisite settled)'
         else 'Removed 250 pcs Metal Scrap from the stash (relation prerequisite reopened)' end,
    'RELATION', p_relation_id
  );
end;
$$;

revoke all on function app.metal_scrap_item_id() from public, anon, authenticated;
revoke all on function app.apply_relation_metal_scrap(uuid, boolean, boolean, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs — drop the old 3-arg signatures, (re)create the 7-arg ones.
-- ---------------------------------------------------------------------------
drop function if exists public.create_relation(text, date, text);
drop function if exists public.update_relation(uuid, text, date, text);

create or replace function public.create_relation(
  p_name                text,
  p_joined_on           date default current_date,
  p_notes               text default null,
  p_handler_member_id   uuid default null,
  p_metal_scrap_settled boolean default false,
  p_oath_date           date default null,
  p_blood_oath          boolean default false
)
returns relations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_relation relations;
begin
  perform app.require_super_admin();

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Name is required' using errcode = 'check_violation';
  end if;

  insert into relations (
    name, joined_on, notes,
    handler_member_id, metal_scrap_settled, oath_date, blood_oath
  )
  values (
    btrim(p_name),
    coalesce(p_joined_on, current_date),
    nullif(btrim(p_notes), ''),
    p_handler_member_id,
    coalesce(p_metal_scrap_settled, false),
    p_oath_date,
    coalesce(p_blood_oath, false)
  )
  returning * into v_relation;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'relation.created', format('Added relation "%s"', v_relation.name), 'RELATION', v_relation.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'RELATION_CREATED', 'relation', v_relation.id, to_jsonb(v_relation));

  perform app.apply_relation_metal_scrap(v_relation.id, false, v_relation.metal_scrap_settled, v_actor);

  return v_relation;
end;
$$;

create or replace function public.update_relation(
  p_relation_id         uuid,
  p_name                text,
  p_joined_on           date,
  p_notes               text default null,
  p_handler_member_id   uuid default null,
  p_metal_scrap_settled boolean default false,
  p_oath_date           date default null,
  p_blood_oath          boolean default false
)
returns relations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_old      relations;
  v_relation relations;
begin
  perform app.require_super_admin();

  select * into v_old from relations where id = p_relation_id;
  if not found then
    raise exception 'Relation not found' using errcode = 'no_data_found';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Name is required' using errcode = 'check_violation';
  end if;

  update relations set
    name = btrim(p_name),
    joined_on = coalesce(p_joined_on, v_old.joined_on),
    notes = nullif(btrim(p_notes), ''),
    handler_member_id = p_handler_member_id,
    metal_scrap_settled = coalesce(p_metal_scrap_settled, false),
    oath_date = p_oath_date,
    blood_oath = coalesce(p_blood_oath, false)
  where id = p_relation_id
  returning * into v_relation;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'relation.updated', format('Updated relation "%s"', v_relation.name), 'RELATION', v_relation.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'RELATION_UPDATED', 'relation', v_relation.id, to_jsonb(v_old), to_jsonb(v_relation));

  perform app.apply_relation_metal_scrap(
    v_relation.id, v_old.metal_scrap_settled, v_relation.metal_scrap_settled, v_actor
  );

  return v_relation;
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
    'create_relation(text, date, text, uuid, boolean, date, boolean)',
    'update_relation(uuid, text, date, text, uuid, boolean, date, boolean)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- one-time backfill — +250 for every relation already marked settled.
-- Guarded: skips entirely once any relation movement exists, so re-running
-- this migration never double-posts.
-- ---------------------------------------------------------------------------
do $$
declare
  v_item_id uuid := app.metal_scrap_item_id();
  v_total   integer;
  r         record;
begin
  if v_item_id is null then
    return; -- no MS stash item yet (fresh DB in the test harness); nothing to do
  end if;
  if exists (select 1 from inventory_movements where reference_type = 'RELATION') then
    return; -- already backfilled / relation movements exist
  end if;

  select count(*) into v_total from relations where metal_scrap_settled;
  if v_total = 0 then
    return;
  end if;

  for r in select id from relations where metal_scrap_settled loop
    insert into inventory_movements (
      item_id, quantity, movement_type, reference_type, reference_id, performed_by, notes
    )
    values (
      v_item_id, 250, 'ADJUSTMENT', 'RELATION', r.id, null,
      'Backfill: metal scrap prerequisite (relation settled before the stash hookup)'
    );
  end loop;

  insert into inventory (item_id, current_quantity, updated_at)
  values (v_item_id, v_total * 250, now())
  on conflict (item_id) do update
    set current_quantity = inventory.current_quantity + excluded.current_quantity,
        updated_at = now();
end;
$$;


-- ####################  0052_pin_function_search_path  ####################

-- ============================================================================
-- 0052_pin_function_search_path
-- Security Advisor "Function Search Path Mutable" — seven app.* helpers created
-- before the SET search_path house rule. ALTER FUNCTION only, no body change.
-- `ALTER FUNCTION ... SET` is idempotent, so this block is safe to re-run.
-- ============================================================================

alter function app.set_updated_at()
  set search_path = public, pg_temp;
alter function app.reject_mutation()
  set search_path = public, pg_temp;
alter function app.forbid_delete()
  set search_path = public, pg_temp;
alter function app.guard_notification_update()
  set search_path = public, pg_temp;
alter function app.cash_category_direction(public.cash_category)
  set search_path = public, pg_temp;
alter function app.submission_line_qty(jsonb, uuid)
  set search_path = public, pg_temp;
alter function app.require_super_admin()
  set search_path = public, pg_temp;


-- ####################  sync the Supabase CLI migration history  ####################
insert into supabase_migrations.schema_migrations (version, name) values
  ('0046','text_length_guards'),
  ('0047','auth_throttle_gc'),
  ('0048','create_production_product'),
  ('0049','finalize_payroll_run_atomic'),
  ('0050','member_dashboard_rpc'),
  ('0051','relation_details'),
  ('0052','pin_function_search_path')
on conflict (version) do nothing;
