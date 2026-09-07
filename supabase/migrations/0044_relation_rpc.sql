-- ============================================================================
-- 0044_relation_rpc
-- Relation writes (Super Admin). SECURITY DEFINER so every change also writes an
-- audit + activity record (audit_logs has no INSERT grant for application
-- users). Mirrors 0030_supplier_rpc.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- create_relation
-- ---------------------------------------------------------------------------
create or replace function public.create_relation(
  p_name      text,
  p_joined_on date default current_date,
  p_notes     text default null
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

  insert into relations (name, joined_on, notes)
  values (
    btrim(p_name),
    coalesce(p_joined_on, current_date),
    nullif(btrim(p_notes), '')
  )
  returning * into v_relation;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'relation.created', format('Added relation "%s"', v_relation.name), 'RELATION', v_relation.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, new_values)
  values (v_actor, 'RELATION_CREATED', 'relation', v_relation.id, to_jsonb(v_relation));

  return v_relation;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_relation
-- ---------------------------------------------------------------------------
create or replace function public.update_relation(
  p_relation_id uuid,
  p_name        text,
  p_joined_on   date,
  p_notes       text default null
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
    notes = nullif(btrim(p_notes), '')
  where id = p_relation_id
  returning * into v_relation;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'relation.updated', format('Updated relation "%s"', v_relation.name), 'RELATION', v_relation.id);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'RELATION_UPDATED', 'relation', v_relation.id, to_jsonb(v_old), to_jsonb(v_relation));

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
    'create_relation(text, date, text)',
    'update_relation(uuid, text, date, text)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;
