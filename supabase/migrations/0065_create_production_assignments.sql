-- ============================================================================
-- 0065_create_production_assignments
-- A production job can have a whole crew in charge, not one person. This takes
-- an array of members and raises one assignment per member, so each is tracked
-- and marked paid on its own — `production_assignments.member_id` stays
-- singular and the RLS in 0062 keeps working unchanged.
--
-- Delegates per member to create_production_assignment, which re-checks Super
-- Admin and writes its own audit + activity + notification rows. One
-- transaction: if any member is invalid, no assignment is created at all.
-- ============================================================================

create or replace function public.create_production_assignments(
  p_member_ids uuid[],
  p_item_id    uuid,
  p_quantity   numeric,
  p_note       text default null
)
returns setof production_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_id uuid;
  v_seen      uuid[] := '{}';
begin
  perform app.require_super_admin();

  if p_member_ids is null or array_length(p_member_ids, 1) is null then
    raise exception 'Pick at least one person to put in charge'
      using errcode = 'check_violation';
  end if;

  if array_length(p_member_ids, 1) > 50 then
    raise exception 'That is too many people for one assignment'
      using errcode = 'check_violation';
  end if;

  foreach v_member_id in array p_member_ids
  loop
    -- Silently skip a repeated id rather than raising two rows for one member.
    if v_member_id = any (v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_member_id;

    return query
    select * from public.create_production_assignment(
      v_member_id, p_item_id, p_quantity, p_note
    );
  end loop;
end;
$$;

revoke all on function
  public.create_production_assignments(uuid[], uuid, numeric, text)
  from public, anon;
grant execute on function
  public.create_production_assignments(uuid[], uuid, numeric, text)
  to authenticated, service_role;
