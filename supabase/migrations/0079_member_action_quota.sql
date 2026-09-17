-- ============================================================================
-- 0079_member_action_quota
-- Per-member mutation quotas, enforced inside the RPCs.
--
-- The member Server Actions for orders and submissions called checkRateLimit()
-- before the RPC. That bounded the app, not the database: an authenticated
-- member holding their own JWT could call create_order / submit_order_payment /
-- cancel_order / submit_material_submission straight through PostgREST, as
-- fast as they liked, and each call fans a notification out to every Super
-- Admin. The quota now lives at the database boundary; the Server Actions no
-- longer keep a second counter for the same operations.
--
-- DESIGN
--   * `member_action_throttle` holds one bucket per (member, action). No
--     policies, no grants: only definer code touches it.
--   * app.consume_member_action(action) derives the member from auth.uid()
--     through app.current_member_id(). It takes no member id and no limit —
--     the limits are fixed in the function body, so a caller can neither
--     spend someone else's quota nor raise their own.
--   * Each RPC calls it as its first data access, before any business row is
--     read for update. Lock order is therefore always bucket -> business rows,
--     and a member's own concurrent calls of one action queue on their bucket.
--   * Fixed window anchored at the first counted call, the same shape as
--     hit_auth_throttle: up to <limit> calls per window; the next one is
--     refused until the window closes, with the remaining wait in the message.
--
-- ROLLBACK, AND WHAT IS COUNTED
--   A PL/pgSQL exception rolls back the whole call, counter included. That is
--   used deliberately rather than worked around:
--     - a refusal for being over quota raises before this call has written
--       anything, so the refusal loses nothing and the persisted count (which
--       is what caused the refusal) keeps refusing until the window ends;
--     - a call that fails for a business reason (insufficient privilege, not
--       pending, bad payload) rolls its increment back with everything else.
--   So the quota counts COMMITTED mutations — exactly the calls that write rows
--   and notify admins. A refused call of either kind leaves no side effect.
--
-- LIMITS (unchanged from the Server Actions they replace; 60 s windows)
--   order:create        15   every caller
--   order:pay           20   members; a Super Admin acting on the admin board
--   order:cancel        20   is not throttled (the old action limit only ever
--                            applied on the member pages)
--   submission:submit   15   every caller
-- Deliberate adjustment: the old limiter blocked for a flat 60 s after the
-- limit tripped; this one refuses only for what remains of the current window
-- (at most 60 s), and refused calls do not extend it.
--
-- Error: SQLSTATE 'CC429' (a project-defined code, recognised by
-- rpcErrorMessage), human-readable message, `retry_after_seconds=<n>` in DETAIL.
--
-- Signatures, return types and grants of the four RPCs are unchanged. Bodies
-- below are the current definitions (0045, 0053, 0055, 0013) verbatim apart from
-- the marked quota call.
-- ============================================================================

create table if not exists public.member_action_throttle (
  member_id         uuid not null references public.members (id) on delete cascade,
  action            text not null,
  window_started_at timestamptz not null,
  hits              integer not null default 0 check (hits >= 0),
  primary key (member_id, action),
  constraint member_action_throttle_action_max_len check (char_length(action) <= 64)
);

comment on table public.member_action_throttle is
  'Per-member mutation quotas. Written only by app.consume_member_action().';

alter table public.member_action_throttle enable row level security;
-- Intentionally no policies.
revoke all on table public.member_action_throttle from anon, authenticated;

create or replace function app.consume_member_action(p_action text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid := app.current_member_id();
  v_limit     integer;
  v_window    integer;
  v_prefix    text;
  v_row       public.member_action_throttle;
  v_now       timestamptz;
  v_wait      integer;
  v_minutes   integer;
  v_tries     integer := 0;
begin
  case p_action
    when 'order:create' then
      v_limit := 15; v_window := 60; v_prefix := 'You''re placing orders too fast.';
    when 'order:pay' then
      v_limit := 20; v_window := 60; v_prefix := 'You''re doing that too fast.';
    when 'order:cancel' then
      v_limit := 20; v_window := 60; v_prefix := 'You''re doing that too fast.';
    when 'submission:submit' then
      v_limit := 15; v_window := 60; v_prefix := 'You''re submitting too fast.';
    else
      raise exception 'consume_member_action: unknown action %', p_action;
  end case;

  -- No member row: nothing to charge. Every caller refuses that session on its
  -- own authorization check a moment later.
  if v_member_id is null then
    return;
  end if;

  loop
    v_tries := v_tries + 1;
    insert into public.member_action_throttle (member_id, action, window_started_at, hits)
    values (v_member_id, p_action, clock_timestamp(), 0)
    on conflict (member_id, action) do nothing;

    select * into v_row
    from public.member_action_throttle
    where member_id = v_member_id and action = p_action
    for update;
    exit when found;

    if v_tries >= 3 then
      raise exception 'consume_member_action: could not lock quota bucket';
    end if;
  end loop;

  v_now := clock_timestamp();

  if v_row.window_started_at < v_now - make_interval(secs => v_window) then
    update public.member_action_throttle
      set window_started_at = v_now, hits = 1
      where member_id = v_member_id and action = p_action;
    return;
  end if;

  if v_row.hits >= v_limit then
    v_wait := greatest(
      1,
      ceil(extract(epoch from (
        v_row.window_started_at + make_interval(secs => v_window) - v_now
      )))::integer
    );
    v_minutes := greatest(1, ceil(v_wait / 60.0)::integer);
    raise exception '% Try again in about % minute%.',
      v_prefix, v_minutes, case when v_minutes = 1 then '' else 's' end
      using errcode = 'CC429',
            detail = format('retry_after_seconds=%s', v_wait);
  end if;

  update public.member_action_throttle
    set hits = v_row.hits + 1
    where member_id = v_member_id and action = p_action;
end;
$$;

revoke all on function app.consume_member_action(text) from public, anon, authenticated;
grant execute on function app.consume_member_action(text) to service_role;

-- ---------------------------------------------------------------------------
-- create_order (current body: 0045)
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

  -- 0079: per-member quota, before any business read or write.
  perform app.consume_member_action('order:create');

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
-- submit_material_submission (current body: 0053)
-- ---------------------------------------------------------------------------
create or replace function public.submit_material_submission(
  p_lines        jsonb,
  p_note         text default null,
  p_period_month date default null,
  p_received_by  uuid default null
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
  v_received_name text;
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

  -- 0079: per-member quota, before any business read or write.
  perform app.consume_member_action('submission:submit');

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

  if p_received_by is null then
    raise exception 'Choose who received your submission' using errcode = 'check_violation';
  end if;
  select m.display_name into v_received_name
  from members m
  where m.id = p_received_by and m.role = 'SUPER_ADMIN' and m.status = 'ACTIVE';
  if v_received_name is null then
    raise exception 'That person cannot receive submissions'
      using errcode = 'foreign_key_violation';
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

  insert into member_submissions (
    period_id, member_id, status, note, submitted_at, received_by, received_by_name
  )
  values (
    v_period.id, v_member_id, 'PENDING', nullif(btrim(p_note), ''), now(),
    p_received_by, v_received_name
  )
  on conflict (period_id, member_id) do update
    set status = 'PENDING',
        note = excluded.note,
        submitted_at = now(),
        received_by = excluded.received_by,
        received_by_name = excluded.received_by_name,
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
    format('%s submitted materials for %s (received by %s)',
           v_member_name, to_char(v_period.period_month, 'Mon YYYY'), v_received_name),
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

-- ---------------------------------------------------------------------------
-- submit_order_payment (current body: 0055)
-- ---------------------------------------------------------------------------
create or replace function public.submit_order_payment(
  p_order_id uuid,
  p_paid_to  uuid default null
)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id    uuid := app.current_member_id();
  v_is_admin     boolean := app.is_super_admin();
  v_order        orders;
  v_paid_to_name text;
begin
  -- 0079: per-member quota, first data access, before the order row lock.
  if not v_is_admin then
    perform app.consume_member_action('order:pay');
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;

  if not v_is_admin and v_order.member_id is distinct from v_member_id then
    raise exception 'You can only submit payment for your own orders'
      using errcode = 'insufficient_privilege';
  end if;

  if v_order.status not in ('PENDING', 'PROCESSING') then
    raise exception 'Payment cannot be submitted for a % order', v_order.status
      using errcode = 'check_violation';
  end if;
  if v_order.payment_status not in ('UNPAID', 'PAYMENT_REJECTED') then
    raise exception 'Payment is already %', v_order.payment_status
      using errcode = 'check_violation';
  end if;

  if p_paid_to is null then
    raise exception 'Choose who you paid' using errcode = 'check_violation';
  end if;
  select m.display_name into v_paid_to_name
  from members m
  where m.id = p_paid_to and m.role = 'SUPER_ADMIN' and m.status = 'ACTIVE';
  if v_paid_to_name is null then
    raise exception 'That person cannot receive payments'
      using errcode = 'foreign_key_violation';
  end if;

  update orders
  set payment_status = 'PAYMENT_SUBMITTED',
      paid_to = p_paid_to,
      paid_to_name = v_paid_to_name
  where id = p_order_id returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id)
  values (v_order.id, 'PAYMENT_SUBMITTED',
          format('Member reported the in-game payment was sent to %s', v_paid_to_name),
          coalesce(v_member_id, v_order.member_id));

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (coalesce(v_member_id, v_order.member_id), 'payment.submitted',
          format('Payment submitted for order %s', v_order.order_number),
          'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (coalesce(v_member_id, v_order.member_id), 'PAYMENT_SUBMITTED', 'order', v_order.id,
          jsonb_build_object('payment_status', 'PAYMENT_SUBMITTED',
                             'paid_to', p_paid_to, 'paid_to_name', v_paid_to_name));

  perform app.notify_super_admins(
    'PAYMENT_SUBMITTED',
    format('Payment to verify — %s', v_order.order_number),
    format('A member reported sending the in-game payment to %s.', v_paid_to_name),
    'ORDER', v_order.id);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_order (current body: 0013)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid := app.current_member_id();
  v_is_admin  boolean := app.is_super_admin();
  v_order     orders;
  v_from      order_status;
begin
  -- 0079: per-member quota, first data access, before the order row lock.
  -- Super Admins cancel from the admin board and are not throttled.
  if not v_is_admin then
    perform app.consume_member_action('order:cancel');
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;

  if v_is_admin then
    if v_order.status not in ('PENDING', 'PROCESSING') then
      raise exception 'A % order cannot be cancelled', v_order.status
        using errcode = 'check_violation';
    end if;
  elsif v_order.member_id is not distinct from v_member_id then
    if v_order.status <> 'PENDING' then
      raise exception 'You can only cancel an order while it is still pending'
        using errcode = 'check_violation';
    end if;
  else
    raise exception 'You cannot cancel this order' using errcode = 'insufficient_privilege';
  end if;

  v_from := v_order.status;
  update orders
  set status = 'CANCELLED', cancelled_at = now(), cancel_reason = nullif(btrim(p_reason), '')
  where id = p_order_id returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id)
  values (v_order.id, 'ORDER_CANCELLED',
          coalesce(nullif(btrim(p_reason), ''),
                   case when v_is_admin then 'Cancelled by Super Admin' else 'Cancelled by member' end),
          coalesce(v_member_id, v_order.member_id));

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (coalesce(v_member_id, v_order.member_id), 'order.cancelled',
          format('Order %s cancelled', v_order.order_number), 'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (coalesce(v_member_id, v_order.member_id), 'ORDER_CANCELLED', 'order', v_order.id,
          jsonb_build_object('status', v_from),
          jsonb_build_object('status', 'CANCELLED', 'reason', nullif(btrim(p_reason), '')));

  if v_is_admin then
    perform app.notify_member(v_order.member_id, 'ORDER_CANCELLED',
            format('Order cancelled — %s', v_order.order_number),
            coalesce(nullif(btrim(p_reason), ''), 'An administrator cancelled this order.'),
            'ORDER', v_order.id);
  else
    perform app.notify_super_admins('ORDER_CANCELLED',
            format('Order cancelled — %s', v_order.order_number),
            'A member cancelled their pending order.', 'ORDER', v_order.id);
  end if;

  return v_order;
end;
$$;

-- Grants: `create or replace` keeps them, restated so a clean install lands
-- identically.
revoke all on function public.create_order(jsonb, text) from public, anon;
grant execute on function public.create_order(jsonb, text) to authenticated, service_role;
revoke all on function public.submit_material_submission(jsonb, text, date, uuid) from public, anon;
grant execute on function public.submit_material_submission(jsonb, text, date, uuid)
  to authenticated, service_role;
revoke all on function public.submit_order_payment(uuid, uuid) from public, anon;
grant execute on function public.submit_order_payment(uuid, uuid) to authenticated, service_role;
revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated, service_role;
