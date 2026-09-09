-- ============================================================================
-- 0055_order_paid_to
-- Records who a member paid — the Super Admin an order's fictional in-game
-- payment was handed to.
--
--   orders.paid_to       : live reference to the recipient (members.id, a
--                          Super Admin).
--   orders.paid_to_name  : snapshot of that person's display name at the time
--                          the payment was reported / verified, so a later
--                          rename or deactivation never rewrites the record
--                          (same rule as member_submissions.received_by_name,
--                          migration 0053).
--
-- The member must name the recipient when they tap "I've paid"; a Super Admin
-- may set or correct it when verifying or recording a payment. Orders that
-- predate this migration keep NULL on both columns.
-- ============================================================================

alter table orders
  add column paid_to      uuid references members (id) on delete set null,
  add column paid_to_name  text;

comment on column orders.paid_to is
  'The Super Admin the member handed the in-game payment to. Required when a member submits payment; a Super Admin may correct it at verify / record. NULL on rows that predate the field.';
comment on column orders.paid_to_name is
  'Snapshot of paid_to''s display name at submit / verify time. Reads use this so a later rename or deactivation never rewrites the record.';

create index orders_paid_to_idx on orders (paid_to);

-- ---------------------------------------------------------------------------
-- list_payment_recipients  (active member) — the "Pay to" picker feed
-- A regular member cannot SELECT other members' rows (RLS), so the order
-- payment form gets its Super Admin list from here. Mirrors
-- list_submission_receivers (0053).
-- ---------------------------------------------------------------------------
create or replace function public.list_payment_recipients()
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, m.display_name
  from members m
  where m.role = 'SUPER_ADMIN'
    and m.status = 'ACTIVE'
    and app.is_active_member()
  order by m.display_name;
$$;

comment on function public.list_payment_recipients() is
  'Active Super Admins, for the "Pay to" picker when a member reports an order payment.';

revoke all on function public.list_payment_recipients() from public, anon;
grant execute on function public.list_payment_recipients()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- submit_order_payment — now requires p_paid_to (a Super Admin).
-- The 1-arg form is dropped so callers resolve unambiguously to the new one.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_order_payment(uuid);

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

revoke all on function public.submit_order_payment(uuid, uuid) from public, anon;
grant execute on function public.submit_order_payment(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- verify_order_payment — optional p_paid_to lets a Super Admin correct the
-- recipient while verifying. NULL leaves whatever the member chose untouched.
-- The 2-arg form is dropped so callers resolve unambiguously to the new one.
-- ---------------------------------------------------------------------------
drop function if exists public.verify_order_payment(uuid, text);

create or replace function public.verify_order_payment(
  p_order_id uuid,
  p_note     text default null,
  p_paid_to  uuid default null
)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor        uuid := app.current_member_id();
  v_order        orders;
  v_paid_to      uuid;
  v_paid_to_name text;
begin
  perform app.require_super_admin();

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;
  if v_order.payment_status <> 'PAYMENT_SUBMITTED' then
    raise exception 'Only submitted payments can be verified (current: %)', v_order.payment_status
      using errcode = 'check_violation';
  end if;

  v_paid_to := coalesce(p_paid_to, v_order.paid_to);
  v_paid_to_name := v_order.paid_to_name;
  if p_paid_to is not null then
    select m.display_name into v_paid_to_name
    from members m
    where m.id = p_paid_to and m.role = 'SUPER_ADMIN' and m.status = 'ACTIVE';
    if v_paid_to_name is null then
      raise exception 'That person cannot receive payments'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  update orders
  set payment_status = 'PAID',
      payment_note = nullif(btrim(p_note), ''),
      paid_to = v_paid_to,
      paid_to_name = v_paid_to_name
  where id = p_order_id returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id, metadata)
  values (v_order.id, 'PAYMENT_VERIFIED',
          coalesce(nullif(btrim(p_note), ''), 'In-game payment confirmed'),
          v_actor, jsonb_build_object('note', nullif(btrim(p_note), ''),
                                      'paid_to_name', v_paid_to_name));

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'payment.verified',
          format('Payment verified for order %s', v_order.order_number),
          'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'PAYMENT_VERIFIED', 'order', v_order.id,
          jsonb_build_object('payment_status', 'PAID', 'note', nullif(btrim(p_note), ''),
                             'paid_to', v_paid_to, 'paid_to_name', v_paid_to_name));

  perform app.notify_member(v_order.member_id, 'PAYMENT_CONFIRMED',
          format('Payment confirmed — %s', v_order.order_number),
          'Your in-game payment has been verified.', 'ORDER', v_order.id);

  return v_order;
end;
$$;

revoke all on function public.verify_order_payment(uuid, text, uuid) from public, anon;
grant execute on function public.verify_order_payment(uuid, text, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- record_order_payment — one-step Super Admin payment (0054), now also takes
-- an optional p_paid_to so the recipient is on record for orders the member
-- never reported themselves. The 2-arg form is dropped.
-- ---------------------------------------------------------------------------
drop function if exists public.record_order_payment(uuid, text);

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_note     text default null,
  p_paid_to  uuid default null
)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor        uuid := app.current_member_id();
  v_order        orders;
  v_from         payment_status;
  v_paid_to      uuid;
  v_paid_to_name text;
begin
  perform app.require_super_admin();

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;

  if v_order.status not in ('PENDING', 'PROCESSING') then
    raise exception 'Payment cannot be recorded for a % order', v_order.status
      using errcode = 'check_violation';
  end if;
  if v_order.payment_status = 'PAID' then
    raise exception 'This order is already paid'
      using errcode = 'check_violation';
  end if;

  v_from := v_order.payment_status;

  v_paid_to := coalesce(p_paid_to, v_order.paid_to);
  v_paid_to_name := v_order.paid_to_name;
  if p_paid_to is not null then
    select m.display_name into v_paid_to_name
    from members m
    where m.id = p_paid_to and m.role = 'SUPER_ADMIN' and m.status = 'ACTIVE';
    if v_paid_to_name is null then
      raise exception 'That person cannot receive payments'
        using errcode = 'foreign_key_violation';
    end if;
  end if;
  -- An order the member already reported carries its own recipient; a
  -- fresh admin-recorded payment must name one.
  if v_paid_to is null then
    raise exception 'Choose who was paid' using errcode = 'check_violation';
  end if;

  update orders
  set payment_status = 'PAID',
      payment_note = nullif(btrim(p_note), ''),
      paid_to = v_paid_to,
      paid_to_name = v_paid_to_name
  where id = p_order_id
  returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id, metadata)
  values (v_order.id, 'PAYMENT_VERIFIED',
          coalesce(nullif(btrim(p_note), ''),
                   'In-game payment recorded by a Super Admin'),
          v_actor,
          jsonb_build_object('recorded', true, 'from', v_from,
                             'note', nullif(btrim(p_note), ''),
                             'paid_to_name', v_paid_to_name));

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'payment.verified',
          format('Payment recorded for order %s', v_order.order_number),
          'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'PAYMENT_VERIFIED', 'order', v_order.id,
          jsonb_build_object('payment_status', v_from),
          jsonb_build_object('payment_status', 'PAID', 'recorded', true,
                             'note', nullif(btrim(p_note), ''),
                             'paid_to', v_paid_to, 'paid_to_name', v_paid_to_name));

  perform app.notify_member(v_order.member_id, 'PAYMENT_CONFIRMED',
          format('Payment confirmed — %s', v_order.order_number),
          'Your payment for this order has been recorded.', 'ORDER', v_order.id);

  return v_order;
end;
$$;

comment on function public.record_order_payment(uuid, text, uuid) is
  'Super Admin one-step payment: moves an open order to PAID from UNPAID / PAYMENT_SUBMITTED / PAYMENT_REJECTED. Unblocks orders where the member never tapped "I''ve paid". Optional p_paid_to records the recipient.';

revoke all on function public.record_order_payment(uuid, text, uuid) from public, anon;
grant execute on function public.record_order_payment(uuid, text, uuid)
  to authenticated, service_role;
