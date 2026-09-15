-- ============================================================================
-- 0075_my_production_assignments
-- The member-facing /production list paginated in the browser tier, not in the
-- database: listMyProductionAssignments read EVERY production_assignment_members
-- row belonging to the caller, mapped them to assignment ids, and then asked
-- for `assignments where id in (<that whole list>)`.
--
-- Two things break as the table grows:
--   * PostgREST caps a response at max-rows (1000 on Supabase). Past that the
--     id list is silently truncated and jobs vanish from the member's list
--     with no error anywhere.
--   * `total` came from the second query, so it counted the truncated set —
--     the pager under-reported to match.
--
-- This RPC does the whole thing in SQL: ownership, filter, order, count and
-- page. It is caller-scoped through app.current_member_id() with no member
-- parameter at all, so a Super Admin opening /production sees THEIR OWN jobs,
-- exactly like everybody else.
--
-- Crew visibility: the payload carries one crew line — the caller's own. That
-- is already all a MEMBER may see under the 0067 RLS policy, and it is what
-- the table renders (`row.crew[0]` = "have I been paid"). Returning only that
-- line also means a page of jobs can never out-run a row cap on the crew side:
-- one page is at most `p_limit` crew rows, whatever the crew size.
--
-- Shape: jsonb { rows: [ <production_assignments row> + crew: [line] ],
--                total: bigint }
-- ============================================================================

create or replace function public.my_production_assignments(
  p_scope  text default 'all',
  p_limit  integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_member uuid := app.current_member_id();
  v_scope  text := coalesce(nullif(btrim(lower(p_scope)), ''), 'all');
  v_limit  integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_total  bigint;
  v_rows   jsonb;
begin
  if v_member is null then
    raise exception 'Only active members can read their assignments'
      using errcode = 'insufficient_privilege';
  end if;

  if v_scope not in ('all', 'unpaid', 'paid', 'cancelled') then
    raise exception 'Unknown filter' using errcode = 'check_violation';
  end if;

  -- One CTE, used for both the count and the page, so they can never disagree.
  with mine as (
    select a.*, l.id as line_id, l.status as line_status
    from production_assignments a
    join production_assignment_members l
      on l.assignment_id = a.id
     and l.member_id = v_member
    where case v_scope
            when 'cancelled' then a.status = 'CANCELLED'
            when 'paid'      then a.status <> 'CANCELLED' and l.status = 'PAID'
            when 'unpaid'    then a.status <> 'CANCELLED' and l.status = 'UNPAID'
            else true
          end
  ),
  -- assigned_at is not unique — two jobs raised in the same statement share it
  -- — so `id` is the tie-breaker that keeps paging deterministic.
  page as (
    select * from mine
    order by assigned_at desc, id desc
    limit v_limit offset v_offset
  )
  select (select count(*) from mine),
         coalesce(
           (select jsonb_agg(
                     to_jsonb(p) - 'line_id' - 'line_status'
                     || jsonb_build_object('crew', jsonb_build_array(to_jsonb(l)))
                     order by p.assigned_at desc, p.id desc
                   )
            from page p
            join production_assignment_members l on l.id = p.line_id),
           '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$$;

comment on function public.my_production_assignments(text, integer, integer) is
  'Caller-scoped page of the signed-in member''s own production assignments, with their own crew line. Never takes a member id.';

revoke all on function public.my_production_assignments(text, integer, integer)
  from public, anon;
grant execute on function public.my_production_assignments(text, integer, integer)
  to authenticated, service_role;

-- Supports the join + filter above: find this member's lines, then their jobs.
create index if not exists production_assignment_members_member_status_idx
  on production_assignment_members (member_id, status);

create index if not exists production_assignments_assigned_at_id_idx
  on production_assignments (assigned_at desc, id desc);
