-- ============================================================================
-- 0015_item_rpc
-- Item catalogue writes (Super Admin). Routed through SECURITY DEFINER
-- functions so every change also writes an audit + activity record
-- (audit_logs has no INSERT grant for application users).
-- ============================================================================

create or replace function public.create_item(
  p_name                text,
  p_category            item_category,
  p_unit                item_unit,
  p_price               numeric,
  p_description         text default null,
  p_sku                 text default null,
  p_low_stock_threshold integer default 0,
  p_orderable           boolean default true,
  p_active              boolean default true
)
returns items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_item  items;
begin
  perform app.require_super_admin();

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Name is required' using errcode = 'check_violation';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Price must be zero or more' using errcode = 'check_violation';
  end if;
  if coalesce(p_low_stock_threshold, 0) < 0 then
    raise exception 'Low-stock threshold cannot be negative' using errcode = 'check_violation';
  end if;

  insert into items (
    name, category, unit, price, description, sku, low_stock_threshold, orderable, active
  )
  values (
    btrim(p_name), p_category, p_unit, p_price,
    nullif(btrim(p_description), ''), nullif(btrim(p_sku), ''),
    coalesce(p_low_stock_threshold, 0), coalesce(p_orderable, true), coalesce(p_active, true)
  )
  returning * into v_item;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'item.created', format('Added item "%s"', v_item.name), 'ITEM', v_item.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'ITEM_CREATED', 'item', v_item.id, to_jsonb(v_item));

  return v_item;
end;
$$;

create or replace function public.update_item(
  p_item_id             uuid,
  p_name                text,
  p_category            item_category,
  p_unit                item_unit,
  p_price               numeric,
  p_description         text default null,
  p_sku                 text default null,
  p_low_stock_threshold integer default 0,
  p_orderable           boolean default true,
  p_active              boolean default true
)
returns items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_old   items;
  v_item  items;
begin
  perform app.require_super_admin();

  select * into v_old from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_old.archived_at is not null then
    raise exception 'Restore this item before editing it' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Name is required' using errcode = 'check_violation';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Price must be zero or more' using errcode = 'check_violation';
  end if;

  update items set
    name = btrim(p_name),
    category = p_category,
    unit = p_unit,
    price = p_price,
    description = nullif(btrim(p_description), ''),
    sku = nullif(btrim(p_sku), ''),
    low_stock_threshold = coalesce(p_low_stock_threshold, 0),
    orderable = coalesce(p_orderable, true),
    active = coalesce(p_active, true)
  where id = p_item_id
  returning * into v_item;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (
    v_actor, 'item.updated',
    case when v_old.price <> v_item.price
         then format('Updated "%s" — price %s → %s', v_item.name, v_old.price, v_item.price)
         else format('Updated item "%s"', v_item.name) end,
    'ITEM', v_item.id
  );

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'ITEM_UPDATED', 'item', v_item.id, to_jsonb(v_old), to_jsonb(v_item));

  return v_item;
end;
$$;

create or replace function public.archive_item(p_item_id uuid)
returns items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_old   items;
  v_item  items;
begin
  perform app.require_super_admin();

  select * into v_old from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_old.archived_at is not null then
    return v_old;
  end if;

  update items
  set archived_at = now(), active = false, orderable = false
  where id = p_item_id
  returning * into v_item;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'item.archived', format('Archived item "%s"', v_item.name), 'ITEM', v_item.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'ITEM_ARCHIVED', 'item', v_item.id, to_jsonb(v_old), to_jsonb(v_item));

  return v_item;
end;
$$;

create or replace function public.restore_item(p_item_id uuid)
returns items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_old   items;
  v_item  items;
begin
  perform app.require_super_admin();

  select * into v_old from items where id = p_item_id;
  if not found then
    raise exception 'Item not found' using errcode = 'no_data_found';
  end if;
  if v_old.archived_at is null then
    return v_old;
  end if;

  update items set archived_at = null, active = true where id = p_item_id
  returning * into v_item;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'item.restored', format('Restored item "%s"', v_item.name), 'ITEM', v_item.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'ITEM_UPDATED', 'item', v_item.id, to_jsonb(v_old), to_jsonb(v_item));

  return v_item;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_item(text, item_category, item_unit, numeric, text, text, integer, boolean, boolean)',
    'update_item(uuid, text, item_category, item_unit, numeric, text, text, integer, boolean, boolean)',
    'archive_item(uuid)',
    'restore_item(uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
