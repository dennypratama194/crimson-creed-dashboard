-- ============================================================================
-- 0013_rpc
-- All multi-table writes go through these SECURITY DEFINER functions so they
-- are atomic and authorization is enforced in the database (PRD §23, §24).
-- Application users have NO direct INSERT/UPDATE grants on operational tables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- internal notification helpers
-- ---------------------------------------------------------------------------
create or replace function app.notify_super_admins(
  p_type notification_type,
  p_title text,
  p_body text,
  p_ref_type reference_type,
  p_ref_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into notifications (recipient_id, type, title, body, reference_type, reference_id)
  select m.id, p_type, p_title, p_body, p_ref_type, p_ref_id
  from members m
  where m.role = 'SUPER_ADMIN' and m.status = 'ACTIVE';
end;
$$;

create or replace function app.notify_member(
  p_member_id uuid,
  p_type notification_type,
  p_title text,
  p_body text,
  p_ref_type reference_type,
  p_ref_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_member_id is null then
    return;
  end if;
  insert into notifications (recipient_id, type, title, body, reference_type, reference_id)
  values (p_member_id, p_type, p_title, p_body, p_ref_type, p_ref_id);
end;
$$;

create or replace function app.require_super_admin()
returns void
language plpgsql
stable
as $$
begin
  if not app.is_super_admin() then
    raise exception 'This action requires Super Admin'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_order
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
begin
  select m.id, m.display_name into v_member_id, v_member_name
  from members m
  where m.user_id = auth.uid() and m.status = 'ACTIVE';

  if v_member_id is null then
    raise exception 'Only active members can create orders'
      using errcode = 'insufficient_privilege';
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
-- submit_order_payment  (member marks "I've paid" in-game)
-- ---------------------------------------------------------------------------
create or replace function public.submit_order_payment(p_order_id uuid)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid := app.current_member_id();
  v_is_admin  boolean := app.is_super_admin();
  v_order     orders;
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

  update orders set payment_status = 'PAYMENT_SUBMITTED'
  where id = p_order_id returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id)
  values (v_order.id, 'PAYMENT_SUBMITTED',
          'Member reported the in-game payment was sent', coalesce(v_member_id, v_order.member_id));

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (coalesce(v_member_id, v_order.member_id), 'payment.submitted',
          format('Payment submitted for order %s', v_order.order_number),
          'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (coalesce(v_member_id, v_order.member_id), 'PAYMENT_SUBMITTED', 'order', v_order.id,
          jsonb_build_object('payment_status', 'PAYMENT_SUBMITTED'));

  perform app.notify_super_admins(
    'PAYMENT_SUBMITTED',
    format('Payment to verify — %s', v_order.order_number),
    'A member reported sending the in-game payment.', 'ORDER', v_order.id);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_order_payment  (Super Admin confirms the fictional in-game payment)
-- ---------------------------------------------------------------------------
create or replace function public.verify_order_payment(p_order_id uuid, p_note text default null)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_order orders;
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

  update orders
  set payment_status = 'PAID',
      payment_note = nullif(btrim(p_note), '')
  where id = p_order_id returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id, metadata)
  values (v_order.id, 'PAYMENT_VERIFIED',
          coalesce(nullif(btrim(p_note), ''), 'In-game payment confirmed'),
          v_actor, jsonb_build_object('note', nullif(btrim(p_note), '')));

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'payment.verified',
          format('Payment verified for order %s', v_order.order_number),
          'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'PAYMENT_VERIFIED', 'order', v_order.id,
          jsonb_build_object('payment_status', 'PAID', 'note', nullif(btrim(p_note), '')));

  perform app.notify_member(v_order.member_id, 'PAYMENT_CONFIRMED',
          format('Payment confirmed — %s', v_order.order_number),
          'Your in-game payment has been verified.', 'ORDER', v_order.id);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- reject_order_payment
-- ---------------------------------------------------------------------------
create or replace function public.reject_order_payment(p_order_id uuid, p_reason text)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_order orders;
begin
  perform app.require_super_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'check_violation';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;
  if v_order.payment_status <> 'PAYMENT_SUBMITTED' then
    raise exception 'Only submitted payments can be rejected (current: %)', v_order.payment_status
      using errcode = 'check_violation';
  end if;

  update orders
  set payment_status = 'PAYMENT_REJECTED', payment_note = btrim(p_reason)
  where id = p_order_id returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id)
  values (v_order.id, 'PAYMENT_REJECTED', btrim(p_reason), v_actor);

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'payment.rejected',
          format('Payment rejected for order %s', v_order.order_number), 'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'PAYMENT_REJECTED', 'order', v_order.id,
          jsonb_build_object('payment_status', 'PAYMENT_REJECTED', 'reason', btrim(p_reason)));

  perform app.notify_member(v_order.member_id, 'PAYMENT_REJECTED',
          format('Payment needs attention — %s', v_order.order_number),
          btrim(p_reason), 'ORDER', v_order.id);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_order_processing  (locks member cancellation — PRD §11)
-- ---------------------------------------------------------------------------
create or replace function public.start_order_processing(p_order_id uuid)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_order orders;
  v_from  order_status;
begin
  perform app.require_super_admin();

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;
  if v_order.status <> 'PENDING' then
    raise exception 'Only pending orders can move to processing (current: %)', v_order.status
      using errcode = 'check_violation';
  end if;

  v_from := v_order.status;
  update orders set status = 'PROCESSING', processing_at = now()
  where id = p_order_id returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id)
  values (v_order.id, 'PROCESSING_STARTED',
          'Order moved to processing. The member can no longer cancel it.', v_actor);

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'order.processing',
          format('Order %s moved to processing', v_order.order_number), 'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'ORDER_STATUS_CHANGED', 'order', v_order.id,
          jsonb_build_object('status', v_from), jsonb_build_object('status', 'PROCESSING'));

  perform app.notify_member(v_order.member_id, 'ORDER_PROCESSING',
          format('Order in progress — %s', v_order.order_number),
          'Your order is now being processed.', 'ORDER', v_order.id);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_order_distribution  (hand-over recorded; draws down stock)
-- ---------------------------------------------------------------------------
create or replace function public.record_order_distribution(p_order_id uuid, p_note text default null)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_order orders;
  v_item  record;
begin
  perform app.require_super_admin();

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;
  if v_order.status <> 'PROCESSING' then
    raise exception 'Order must be processing before distribution (current: %)', v_order.status
      using errcode = 'check_violation';
  end if;
  if v_order.payment_status <> 'PAID' then
    raise exception 'Payment must be verified before distribution' using errcode = 'check_violation';
  end if;
  if v_order.distribution_status <> 'NOT_DISTRIBUTED' then
    raise exception 'This order is already distributed' using errcode = 'check_violation';
  end if;

  update orders
  set distribution_status = 'DISTRIBUTED', distribution_note = nullif(btrim(p_note), '')
  where id = p_order_id returning * into v_order;

  for v_item in
    select item_id, sum(quantity) as quantity
    from order_items where order_id = p_order_id group by item_id
  loop
    insert into inventory_movements (
      item_id, quantity, movement_type, reference_type, reference_id, performed_by, notes
    )
    values (
      v_item.item_id, -v_item.quantity, 'DISTRIBUTION', 'ORDER', v_order.id, v_actor,
      format('Distributed for order %s', v_order.order_number)
    );

    insert into inventory (item_id, current_quantity, updated_at)
    values (v_item.item_id, -v_item.quantity, now())
    on conflict (item_id) do update
      set current_quantity = inventory.current_quantity - v_item.quantity,
          updated_at = now();
  end loop;

  insert into order_timeline (order_id, entry_type, description, actor_id, metadata)
  values (v_order.id, 'DISTRIBUTION_RECORDED',
          coalesce(nullif(btrim(p_note), ''), 'Items handed over in-game'),
          v_actor, jsonb_build_object('note', nullif(btrim(p_note), '')));

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'order.distributed',
          format('Order %s distributed', v_order.order_number), 'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'DISTRIBUTION_RECORDED', 'order', v_order.id,
          jsonb_build_object('distribution_status', 'DISTRIBUTED', 'note', nullif(btrim(p_note), '')));

  perform app.notify_member(v_order.member_id, 'DISTRIBUTION_COMPLETED',
          format('Order handed over — %s', v_order.order_number),
          'Your items have been distributed in-game.', 'ORDER', v_order.id);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_order
-- ---------------------------------------------------------------------------
create or replace function public.complete_order(p_order_id uuid)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_order orders;
begin
  perform app.require_super_admin();

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;
  if v_order.status <> 'PROCESSING' then
    raise exception 'Only processing orders can be completed (current: %)', v_order.status
      using errcode = 'check_violation';
  end if;
  if v_order.payment_status <> 'PAID' or v_order.distribution_status <> 'DISTRIBUTED' then
    raise exception 'An order can only be completed once it is paid and distributed'
      using errcode = 'check_violation';
  end if;

  update orders set status = 'COMPLETED', completed_at = now()
  where id = p_order_id returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id)
  values (v_order.id, 'ORDER_COMPLETED', 'Order completed', v_actor);

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'order.completed',
          format('Order %s completed', v_order.order_number), 'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'ORDER_STATUS_CHANGED', 'order', v_order.id,
          jsonb_build_object('status', 'PROCESSING'), jsonb_build_object('status', 'COMPLETED'));

  perform app.notify_member(v_order.member_id, 'ORDER_COMPLETED',
          format('Order complete — %s', v_order.order_number),
          'Your order is complete. Thanks!', 'ORDER', v_order.id);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_order  (member: own PENDING only; admin: PENDING or PROCESSING)
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

-- ---------------------------------------------------------------------------
-- reject_order  (Super Admin)
-- ---------------------------------------------------------------------------
create or replace function public.reject_order(p_order_id uuid, p_reason text)
returns orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_order orders;
  v_from  order_status;
begin
  perform app.require_super_admin();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required' using errcode = 'check_violation';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'no_data_found';
  end if;
  if v_order.status not in ('PENDING', 'PROCESSING') then
    raise exception 'A % order cannot be rejected', v_order.status
      using errcode = 'check_violation';
  end if;

  v_from := v_order.status;
  update orders
  set status = 'REJECTED', cancelled_at = now(), cancel_reason = btrim(p_reason)
  where id = p_order_id returning * into v_order;

  insert into order_timeline (order_id, entry_type, description, actor_id)
  values (v_order.id, 'ORDER_REJECTED', btrim(p_reason), v_actor);

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'order.rejected',
          format('Order %s rejected', v_order.order_number), 'ORDER', v_order.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'ORDER_REJECTED', 'order', v_order.id,
          jsonb_build_object('status', v_from),
          jsonb_build_object('status', 'REJECTED', 'reason', btrim(p_reason)));

  perform app.notify_member(v_order.member_id, 'ORDER_REJECTED',
          format('Order rejected — %s', v_order.order_number), btrim(p_reason), 'ORDER', v_order.id);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_inventory_movement  (Super Admin manual stock change)
-- ---------------------------------------------------------------------------
create or replace function public.record_inventory_movement(
  p_item_id uuid,
  p_movement_type movement_type,
  p_quantity integer,
  p_notes text default null
)
returns inventory
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_item     items;
  v_inv      inventory;
  v_ref_type reference_type;
begin
  perform app.require_super_admin();

  if p_movement_type in ('ORDER', 'DISTRIBUTION') then
    raise exception '% movements are recorded by the order workflow only', p_movement_type
      using errcode = 'check_violation';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'Quantity must be a non-zero whole number' using errcode = 'check_violation';
  end if;

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_item.archived_at is not null then
    raise exception 'Cannot move stock for an archived item' using errcode = 'check_violation';
  end if;

  v_ref_type := case when p_movement_type = 'ADJUSTMENT'
                     then 'INVENTORY_ADJUSTMENT'::reference_type
                     else 'MANUAL'::reference_type end;

  insert into inventory_movements (
    item_id, quantity, movement_type, reference_type, reference_id, performed_by, notes
  )
  values (p_item_id, p_quantity, p_movement_type, v_ref_type, p_item_id, v_actor,
          nullif(btrim(p_notes), ''));

  insert into inventory (item_id, current_quantity, updated_at)
  values (p_item_id, p_quantity, now())
  on conflict (item_id) do update
    set current_quantity = inventory.current_quantity + p_quantity,
        updated_at = now()
  returning * into v_inv;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'inventory.moved',
          format('%s %s x%s (%s)', initcap(replace(p_movement_type::text, '_', ' ')),
                 v_item.name, abs(p_quantity), p_movement_type),
          'ITEM', p_item_id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'INVENTORY_ADJUSTED', 'item', p_item_id,
          jsonb_build_object('movement_type', p_movement_type, 'quantity', p_quantity,
                             'current_quantity', v_inv.current_quantity,
                             'notes', nullif(btrim(p_notes), '')));

  if v_item.low_stock_threshold > 0 and v_inv.current_quantity <= v_item.low_stock_threshold then
    perform app.notify_super_admins('LOW_STOCK',
            format('Low stock — %s', v_item.name),
            format('%s is at %s (threshold %s).', v_item.name, v_inv.current_quantity,
                   v_item.low_stock_threshold),
            'ITEM', p_item_id);
  end if;

  return v_inv;
end;
$$;

-- ---------------------------------------------------------------------------
-- adjust_inventory  (Super Admin sets the counted quantity; records the delta)
-- ---------------------------------------------------------------------------
create or replace function public.adjust_inventory(
  p_item_id uuid,
  p_target_quantity integer,
  p_notes text default null
)
returns inventory
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current integer;
  v_delta   integer;
  v_inv     inventory;
begin
  perform app.require_super_admin();

  if p_target_quantity is null then
    raise exception 'A target quantity is required' using errcode = 'check_violation';
  end if;

  select current_quantity into v_current from inventory where item_id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;

  v_delta := p_target_quantity - v_current;
  if v_delta = 0 then
    select * into v_inv from inventory where item_id = p_item_id;
    return v_inv;
  end if;

  return public.record_inventory_movement(p_item_id, 'ADJUSTMENT', v_delta, p_notes);
end;
$$;

-- ---------------------------------------------------------------------------
-- grants: expose to authenticated only (anon has no member row anyway)
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_order(jsonb, text)',
    'submit_order_payment(uuid)',
    'verify_order_payment(uuid, text)',
    'reject_order_payment(uuid, text)',
    'start_order_processing(uuid)',
    'record_order_distribution(uuid, text)',
    'complete_order(uuid)',
    'cancel_order(uuid, text)',
    'reject_order(uuid, text)',
    'record_inventory_movement(uuid, movement_type, integer, text)',
    'adjust_inventory(uuid, integer, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
