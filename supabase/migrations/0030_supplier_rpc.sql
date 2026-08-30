-- ============================================================================
-- 0030_supplier_rpc
-- Supplier + price-book writes (Super Admin). SECURITY DEFINER so every change
-- also writes an audit + activity record (audit_logs has no INSERT grant for
-- application users). Mirrors 0015_item_rpc.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- create_supplier
-- ---------------------------------------------------------------------------
create or replace function public.create_supplier(
  p_name    text,
  p_code    text,
  p_contact text default null,
  p_notes   text default null,
  p_active  boolean default true
)
returns suppliers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_supplier suppliers;
begin
  perform app.require_super_admin();

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Name is required' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_code), '') = '' then
    raise exception 'Code is required' using errcode = 'check_violation';
  end if;

  insert into suppliers (name, code, contact, notes, active)
  values (
    btrim(p_name), btrim(p_code),
    nullif(btrim(p_contact), ''), nullif(btrim(p_notes), ''),
    coalesce(p_active, true)
  )
  returning * into v_supplier;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'supplier.created', format('Added supplier "%s"', v_supplier.name), 'SUPPLIER', v_supplier.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'SUPPLIER_CREATED', 'supplier', v_supplier.id, to_jsonb(v_supplier));

  return v_supplier;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_supplier
-- ---------------------------------------------------------------------------
create or replace function public.update_supplier(
  p_supplier_id uuid,
  p_name        text,
  p_code        text,
  p_contact     text default null,
  p_notes       text default null,
  p_active      boolean default true
)
returns suppliers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_old      suppliers;
  v_supplier suppliers;
begin
  perform app.require_super_admin();

  select * into v_old from suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Supplier not found' using errcode = 'no_data_found';
  end if;
  if v_old.archived_at is not null then
    raise exception 'Restore this supplier before editing it' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Name is required' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_code), '') = '' then
    raise exception 'Code is required' using errcode = 'check_violation';
  end if;

  update suppliers set
    name = btrim(p_name),
    code = btrim(p_code),
    contact = nullif(btrim(p_contact), ''),
    notes = nullif(btrim(p_notes), ''),
    active = coalesce(p_active, true)
  where id = p_supplier_id
  returning * into v_supplier;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'supplier.updated', format('Updated supplier "%s"', v_supplier.name), 'SUPPLIER', v_supplier.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'SUPPLIER_UPDATED', 'supplier', v_supplier.id, to_jsonb(v_old), to_jsonb(v_supplier));

  return v_supplier;
end;
$$;

-- ---------------------------------------------------------------------------
-- archive_supplier / restore_supplier
-- ---------------------------------------------------------------------------
create or replace function public.archive_supplier(p_supplier_id uuid)
returns suppliers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_old      suppliers;
  v_supplier suppliers;
begin
  perform app.require_super_admin();

  select * into v_old from suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Supplier not found' using errcode = 'no_data_found';
  end if;
  if v_old.archived_at is not null then
    return v_old;
  end if;

  update suppliers set archived_at = now(), active = false
  where id = p_supplier_id
  returning * into v_supplier;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'supplier.archived', format('Archived supplier "%s"', v_supplier.name), 'SUPPLIER', v_supplier.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'SUPPLIER_ARCHIVED', 'supplier', v_supplier.id, to_jsonb(v_old), to_jsonb(v_supplier));

  return v_supplier;
end;
$$;

create or replace function public.restore_supplier(p_supplier_id uuid)
returns suppliers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_old      suppliers;
  v_supplier suppliers;
begin
  perform app.require_super_admin();

  select * into v_old from suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Supplier not found' using errcode = 'no_data_found';
  end if;
  if v_old.archived_at is null then
    return v_old;
  end if;

  update suppliers set archived_at = null, active = true where id = p_supplier_id
  returning * into v_supplier;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'supplier.restored', format('Restored supplier "%s"', v_supplier.name), 'SUPPLIER', v_supplier.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'SUPPLIER_UPDATED', 'supplier', v_supplier.id, to_jsonb(v_old), to_jsonb(v_supplier));

  return v_supplier;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_supplier_item — upsert one line of a supplier's price book
-- ---------------------------------------------------------------------------
create or replace function public.set_supplier_item(
  p_supplier_id  uuid,
  p_item_id      uuid,
  p_buy_price    numeric default 0,
  p_sell_price   numeric default null,
  p_max_quantity integer default null,
  p_active       boolean default true
)
returns supplier_items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid := app.current_member_id();
  v_existing supplier_items;
  v_line     supplier_items;
  v_supplier suppliers;
  v_item     items;
begin
  perform app.require_super_admin();

  select * into v_supplier from suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Supplier not found' using errcode = 'no_data_found';
  end if;
  if v_supplier.archived_at is not null then
    raise exception 'Restore this supplier before editing its catalogue' using errcode = 'check_violation';
  end if;

  select * into v_item from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_item.archived_at is not null then
    raise exception 'That item is archived' using errcode = 'check_violation';
  end if;

  if p_buy_price is null or p_buy_price < 0 then
    raise exception 'Buy price must be zero or more' using errcode = 'check_violation';
  end if;
  if p_sell_price is not null and p_sell_price < 0 then
    raise exception 'Sell price cannot be negative' using errcode = 'check_violation';
  end if;
  if p_max_quantity is not null and p_max_quantity < 0 then
    raise exception 'Max quantity cannot be negative' using errcode = 'check_violation';
  end if;

  select * into v_existing from supplier_items
  where supplier_id = p_supplier_id and item_id = p_item_id;

  insert into supplier_items (supplier_id, item_id, buy_price, sell_price, max_quantity, active)
  values (
    p_supplier_id, p_item_id, p_buy_price, p_sell_price, p_max_quantity,
    coalesce(p_active, true)
  )
  on conflict (supplier_id, item_id) do update set
    buy_price = excluded.buy_price,
    sell_price = excluded.sell_price,
    max_quantity = excluded.max_quantity,
    active = excluded.active
  returning * into v_line;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'supplier.item_set',
    format('%s "%s" for supplier "%s"',
           case when v_existing.id is null then 'Listed' else 'Updated' end,
           v_item.name, v_supplier.name),
    'SUPPLIER', v_supplier.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (
    v_actor, 'SUPPLIER_ITEM_SET', 'supplier_item', v_line.id,
    case when v_existing.id is null then null else to_jsonb(v_existing) end,
    to_jsonb(v_line)
  );

  return v_line;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_supplier_item — drop one price-book line (hard delete; pure config)
-- ---------------------------------------------------------------------------
create or replace function public.remove_supplier_item(p_supplier_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_line  supplier_items;
  v_item  items;
  v_sup   suppliers;
begin
  perform app.require_super_admin();

  select * into v_line from supplier_items where id = p_supplier_item_id;
  if not found then
    raise exception 'That supplier item was not found' using errcode = 'no_data_found';
  end if;
  select * into v_item from items where id = v_line.item_id;
  select * into v_sup from suppliers where id = v_line.supplier_id;

  delete from supplier_items where id = p_supplier_item_id;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'supplier.item_removed',
    format('Removed "%s" from supplier "%s"', v_item.name, v_sup.name),
    'SUPPLIER', v_sup.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values)
  values (v_actor, 'SUPPLIER_ITEM_REMOVED', 'supplier_item', p_supplier_item_id, to_jsonb(v_line));
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
    'create_supplier(text, text, text, text, boolean)',
    'update_supplier(uuid, text, text, text, text, boolean)',
    'archive_supplier(uuid)',
    'restore_supplier(uuid)',
    'set_supplier_item(uuid, uuid, numeric, numeric, integer, boolean)',
    'remove_supplier_item(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
