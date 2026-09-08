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
-- Still Super Admin only. RPC arg lists grow (trailing, defaulted).
-- ============================================================================

alter table relations
  add column handler_member_id   uuid references members (id) on delete set null,
  add column metal_scrap_settled boolean not null default false,
  add column oath_date           date,
  add column blood_oath          boolean not null default false;

comment on column relations.handler_member_id is 'Member responsible for this relation (the "PJ" on the roster sheet). Null = unassigned.';
comment on column relations.metal_scrap_settled is 'Metal-scrap prerequisite (250 pcs) settled ("lunas"). Toggling posts/reverses stock.';
comment on column relations.oath_date is 'Date the oath was taken, if recorded.';
comment on column relations.blood_oath is 'Blood oath taken.';

create index relations_handler_member_id_idx
  on relations (handler_member_id)
  where handler_member_id is not null;

-- ── Metal Scrap is a piece count, not a weight ──────────────────────────────
update items set unit = 'UNIT'::item_unit
where id = (select inventory_item_id from submission_material_types where code = 'MS');

update submission_material_types set unit = 'UNIT'::item_unit where code = 'MS';

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
-- RPCs — drop the old signatures, recreate with the four new trailing params.
-- ---------------------------------------------------------------------------
drop function if exists public.create_relation(text, date, text);
drop function if exists public.update_relation(uuid, text, date, text);

create function public.create_relation(
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

create function public.update_relation(
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
-- one-time backfill — +250 for every relation already marked settled
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
