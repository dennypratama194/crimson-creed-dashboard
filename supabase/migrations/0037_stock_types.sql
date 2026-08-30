-- ============================================================================
-- 0037_stock_types
-- The company stash (/admin/inventory) holds everything physically on hand,
-- not only the member-facing catalogue. `items.stock_type` separates sellable
-- catalogue goods from raw materials, tools and seized property:
--
--   CATALOGUE     - a member-facing product; carries a price, may be orderable
--   RAW_MATERIAL  - inputs held for production / crafting
--   TOOL          - equipment the org owns
--   SEIZED        - confiscated property held in the stash
--   OTHER         - anything else tracked but never sold
--
-- Every existing row backfills to CATALOGUE, so the catalogue is unchanged.
-- Only CATALOGUE items can be `orderable` (enforced by constraint + RPC), so a
-- non-catalogue item can never leak into the member order path.
-- ============================================================================

create type stock_type as enum
  ('CATALOGUE', 'RAW_MATERIAL', 'TOOL', 'SEIZED', 'OTHER');

alter table items
  add column stock_type stock_type not null default 'CATALOGUE';

create index items_stock_type_idx on items (stock_type) where archived_at is null;

alter table items
  add constraint items_only_catalogue_orderable
  check (orderable = false or stock_type = 'CATALOGUE');

-- The monthly-submission material stock items (Metal Scrap / Empty Bottle /
-- Empty Can, seeded by 0033) are raw materials, not a member-facing product.
update items set stock_type = 'RAW_MATERIAL'
where id in (select inventory_item_id from submission_material_types);

-- ── RLS: members only ever see the catalogue ──────────────────────────────
-- Non-catalogue stock (raw materials, tools, seized property) is Super Admin
-- only, the same boundary suppliers sit behind.
drop policy if exists items_select on items;
create policy items_select on items
  for select to authenticated
  using (
    app.is_super_admin()
    or (stock_type = 'CATALOGUE' and active and archived_at is null)
  );

-- ── extend the item write RPCs with p_stock_type ──────────────────────────
-- Added as a trailing defaulted argument so existing positional callers keep
-- working. Non-catalogue items are forced non-orderable and price defaults to 0.
drop function if exists public.create_item(
  text, item_category, item_unit, numeric, text, text, integer, boolean, boolean, text
);
drop function if exists public.update_item(
  uuid, text, item_category, item_unit, numeric, text, text, integer, boolean, boolean, text
);

create function public.create_item(
  p_name                text,
  p_category            item_category,
  p_unit                item_unit,
  p_price               numeric,
  p_description         text default null,
  p_sku                 text default null,
  p_low_stock_threshold integer default 0,
  p_orderable           boolean default true,
  p_active              boolean default true,
  p_image_url           text default null,
  p_stock_type          stock_type default 'CATALOGUE'
)
returns items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := app.current_member_id();
  v_item       items;
  v_stock_type stock_type := coalesce(p_stock_type, 'CATALOGUE');
  v_orderable  boolean := coalesce(p_orderable, true) and v_stock_type = 'CATALOGUE';
  -- Only catalogue goods carry a member-facing price; the stash has none.
  v_price      numeric := case when v_stock_type = 'CATALOGUE'
                               then coalesce(p_price, 0) else 0 end;
begin
  perform app.require_super_admin();

  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Name is required' using errcode = 'check_violation';
  end if;
  if v_price < 0 then
    raise exception 'Price must be zero or more' using errcode = 'check_violation';
  end if;
  if coalesce(p_low_stock_threshold, 0) < 0 then
    raise exception 'Low-stock threshold cannot be negative' using errcode = 'check_violation';
  end if;

  insert into items (
    name, category, unit, price, description, sku, low_stock_threshold,
    orderable, active, image_url, stock_type
  )
  values (
    btrim(p_name), p_category, p_unit, v_price,
    nullif(btrim(p_description), ''), nullif(btrim(p_sku), ''),
    coalesce(p_low_stock_threshold, 0), v_orderable,
    coalesce(p_active, true), nullif(btrim(p_image_url), ''), v_stock_type
  )
  returning * into v_item;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'item.created', format('Added item "%s"', v_item.name), 'ITEM', v_item.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'ITEM_CREATED', 'item', v_item.id, to_jsonb(v_item));

  return v_item;
end;
$$;

create function public.update_item(
  p_item_id             uuid,
  p_name                text,
  p_category            item_category,
  p_unit                item_unit,
  p_price               numeric,
  p_description         text default null,
  p_sku                 text default null,
  p_low_stock_threshold integer default 0,
  p_orderable           boolean default true,
  p_active              boolean default true,
  p_image_url           text default null,
  p_stock_type          stock_type default 'CATALOGUE'
)
returns items
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor      uuid := app.current_member_id();
  v_old        items;
  v_item       items;
  v_stock_type stock_type := coalesce(p_stock_type, 'CATALOGUE');
  v_orderable  boolean := coalesce(p_orderable, true) and v_stock_type = 'CATALOGUE';
  -- Only catalogue goods carry a member-facing price; the stash has none.
  v_price      numeric := case when v_stock_type = 'CATALOGUE'
                               then coalesce(p_price, 0) else 0 end;
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
  if v_price < 0 then
    raise exception 'Price must be zero or more' using errcode = 'check_violation';
  end if;

  update items set
    name = btrim(p_name),
    category = p_category,
    unit = p_unit,
    price = v_price,
    description = nullif(btrim(p_description), ''),
    sku = nullif(btrim(p_sku), ''),
    low_stock_threshold = coalesce(p_low_stock_threshold, 0),
    orderable = v_orderable,
    active = coalesce(p_active, true),
    image_url = nullif(btrim(p_image_url), ''),
    stock_type = v_stock_type
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

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_item(text, item_category, item_unit, numeric, text, text, integer, boolean, boolean, text, stock_type)',
    'update_item(uuid, text, item_category, item_unit, numeric, text, text, integer, boolean, boolean, text, stock_type)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
