-- ============================================================================
-- 0054_record_order_payment
-- One-step payment recording for a Super Admin.
--
-- The normal payment flow is two hands: the member asserts "I've paid"
-- (submit_order_payment -> PAYMENT_SUBMITTED) and a Super Admin confirms it
-- (verify_order_payment -> PAID). That leaves an order stranded whenever the
-- member never taps "I've paid" -- e.g. a Super Admin placed the order
-- themselves, or moved it to PROCESSING before the member paid. The admin
-- surface then shows only Cancel / Reject: a dead end.
--
-- record_order_payment collapses both hands into one Super-Admin action. It
-- moves an OPEN order (PENDING / PROCESSING) straight to PAID from UNPAID,
-- PAYMENT_SUBMITTED or PAYMENT_REJECTED, and writes its own timeline / audit
-- lines so the trail shows an admin recorded it -- never a fake "member
-- reported the payment".
--
-- submit_order_payment / verify_order_payment / reject_order_payment are
-- unchanged; the member's own "I've paid" path still works exactly as before.
-- ============================================================================

create or replace function public.record_order_payment(
  p_order_id uuid,
  p_note     text default null
)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_order orders;
  v_from  payment_status;
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

  update orders
  set payment_status = 'PAID',
      payment_note = nullif(btrim(p_note), '')
  where id = p_order_id
  returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id, metadata)
  values (v_order.id, 'PAYMENT_VERIFIED',
          coalesce(nullif(btrim(p_note), ''),
                   'In-game payment recorded by a Super Admin'),
          v_actor,
          jsonb_build_object('recorded', true, 'from', v_from,
                             'note', nullif(btrim(p_note), '')));

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'payment.verified',
          format('Payment recorded for order %s', v_order.order_number),
          'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'PAYMENT_VERIFIED', 'order', v_order.id,
          jsonb_build_object('payment_status', v_from),
          jsonb_build_object('payment_status', 'PAID', 'recorded', true,
                             'note', nullif(btrim(p_note), '')));

  perform app.notify_member(v_order.member_id, 'PAYMENT_CONFIRMED',
          format('Payment confirmed — %s', v_order.order_number),
          'Your payment for this order has been recorded.', 'ORDER', v_order.id);

  return v_order;
end;
$$;

comment on function public.record_order_payment(uuid, text) is
  'Super Admin one-step payment: moves an open order to PAID from UNPAID / PAYMENT_SUBMITTED / PAYMENT_REJECTED. Unblocks orders where the member never tapped "I''ve paid".';

revoke all on function public.record_order_payment(uuid, text) from public, anon;
grant execute on function public.record_order_payment(uuid, text)
  to authenticated, service_role;
