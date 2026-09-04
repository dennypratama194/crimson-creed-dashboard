-- ============================================================================
-- 0040_drop_supplier_code
-- Suppliers are identified by name alone. The short code repeated the name in
-- every list row and cost a required field on the create/edit form, so it goes.
-- suppliers_name_lower_key (0029) already keeps names unique.
--
-- The two RPCs that took p_code are dropped before being re-declared — a plain
-- CREATE OR REPLACE with fewer arguments would leave the old signature behind
-- as an overload.
-- ============================================================================

drop function if exists public.create_supplier(text, text, text, text, boolean);
drop function if exists public.update_supplier(uuid, text, text, text, text, boolean);

-- Drops suppliers_code_not_blank and suppliers_code_lower_key with it.
alter table suppliers drop column code;

-- ---------------------------------------------------------------------------
-- create_supplier
-- ---------------------------------------------------------------------------
create function public.create_supplier(
  p_name    text,
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

  insert into suppliers (name, contact, notes, active)
  values (
    btrim(p_name),
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
create function public.update_supplier(
  p_supplier_id uuid,
  p_name        text,
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

  update suppliers set
    name = btrim(p_name),
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
-- grants (mirrors 0030_supplier_rpc.sql)
-- ---------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_supplier(text, text, text, boolean)',
    'update_supplier(uuid, text, text, text, boolean)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
