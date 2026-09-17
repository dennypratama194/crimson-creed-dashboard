-- ============================================================================
-- 0080_bounded_read_rpcs
-- Read paths that pulled child rows through PostgREST and aggregated them in
-- the app. PostgREST caps a response at max-rows (1000 on Supabase) and says
-- nothing when it does, so each of these silently under-reported once the
-- child table grew:
--
--   admin_submission_month(month)
--     /admin/submissions fetched every member_submission_lines row for the
--     month with one `in (<every submission id>)` query and summed the column
--     totals in JavaScript. Three materials x 334 submissions = 1002 lines:
--     past that, quantities disappeared from the grid and the totals under-
--     counted with them. Now one jsonb value — rows, per-material totals and
--     status counts built in SQL, where no row cap applies.
--     Serves: member_submissions (period_id) [member_submissions_period_idx],
--             member_submission_lines (member_submission_id)
--             [member_submission_lines_submission_idx].
--
--   my_submission_history(limit, offset)
--     The member history table read every submission the member ever made plus
--     all their lines, unpaged. Now paged and counted in SQL, caller-scoped
--     through app.current_member_id() with no member parameter — a Super Admin
--     sees their own history like everyone else, the same rule as 0057/0075.
--     Serves: member_submissions (member_id) [member_submissions_member_idx].
--
--   supplier_item_counts(supplier ids)
--     /admin/suppliers downloaded every supplier_items row for the page's
--     suppliers to count them in JavaScript. A 20-supplier page with more than
--     1000 listings between them lost counts. Now grouped in SQL; one row per
--     supplier, and the id list is capped at 100 (a page is 20).
--     Serves: supplier_items (supplier_id) [supplier_items_supplier_idx].
--
-- Read-only, additive: no table, policy or existing function changes. No new
-- index — each query above is served by one that already exists.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin_submission_month(p_period_month) — Super Admin only
-- Shape: jsonb {
--   hasPeriod: boolean,
--   targets:   { <material_type_id>: target_quantity },
--   rows: [ { memberId, memberName, rank, active, submissionId, status,
--             submittedAt, confirmedAt, note, reviewNote, receivedById,
--             receivedByName, quantities: { <material_type_id>: quantity } } ],
--   totals:    { <material_type_id>: sum of quantity over every submission },
--   counts:    { members, confirmed, pending, rejected, missing }
-- }
-- Rows: every ACTIVE member (display_name, id order), then any member who
-- submitted for the month but is no longer active ("stragglers", same order).
-- Never creates the period — reading a month must not open it.
-- ---------------------------------------------------------------------------
create or replace function public.admin_submission_month(p_period_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_period_id uuid;
  v_result    jsonb;
begin
  perform app.require_super_admin();

  if p_period_month is null then
    raise exception 'Choose a month' using errcode = 'check_violation';
  end if;

  select id into v_period_id
  from submission_periods
  where period_month = date_trunc('month', p_period_month)::date;

  with subs as (
    select s.*
    from member_submissions s
    where s.period_id = v_period_id
  ),
  qty as (
    select l.member_submission_id,
           jsonb_object_agg(l.material_type_id, l.quantity) as quantities
    from member_submission_lines l
    join subs s on s.id = l.member_submission_id
    group by l.member_submission_id
  ),
  grid as (
    -- active members first, then stragglers; each in display_name, id order
    select 0 as bucket, m.display_name as sort_name, m.id as member_id,
           m.display_name as member_name, m.rank::text as rank, true as active
    from members m
    where m.status = 'ACTIVE'
    union all
    select 1, coalesce(m.display_name, ''), s.member_id,
           m.display_name, null, false
    from subs s
    left join members m on m.id = s.member_id
    where m.id is null or m.status <> 'ACTIVE'
  ),
  rows_out as (
    select g.bucket, g.sort_name, g.member_id,
           jsonb_build_object(
             'memberId', g.member_id,
             'memberName', g.member_name,
             'rank', g.rank,
             'active', g.active,
             'submissionId', s.id,
             'status', s.status,
             'submittedAt', s.submitted_at,
             'confirmedAt', s.confirmed_at,
             'note', s.note,
             'reviewNote', s.review_note,
             'receivedById', s.received_by,
             'receivedByName', s.received_by_name,
             'quantities', coalesce(q.quantities, '{}'::jsonb)
           ) as row_json,
           s.status
    from grid g
    left join subs s on s.member_id = g.member_id
    left join qty q on q.member_submission_id = s.id
  )
  select jsonb_build_object(
    'hasPeriod', v_period_id is not null,
    'targets', coalesce((
      select jsonb_object_agg(t.material_type_id, t.target_quantity)
      from submission_period_targets t
      where t.period_id = v_period_id
    ), '{}'::jsonb),
    'rows', coalesce((
      select jsonb_agg(r.row_json order by r.bucket, r.sort_name, r.member_id)
      from rows_out r
    ), '[]'::jsonb),
    'totals', coalesce((
      select jsonb_object_agg(x.material_type_id, x.total)
      from (
        select l.material_type_id, sum(l.quantity) as total
        from member_submission_lines l
        join subs s on s.id = l.member_submission_id
        group by l.material_type_id
      ) x
    ), '{}'::jsonb),
    'counts', (
      select jsonb_build_object(
        'members',   count(*),
        'confirmed', count(*) filter (where r.status = 'CONFIRMED'),
        'pending',   count(*) filter (where r.status = 'PENDING'),
        'rejected',  count(*) filter (where r.status = 'REJECTED'),
        'missing',   count(*) filter (where r.status is null)
      )
      from rows_out r
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_submission_history(p_limit, p_offset) — the caller's own submissions
-- Shape: jsonb { rows: [ { periodMonth, submission: <member_submissions row>,
--                          quantities: { <material_type_id>: quantity } } ],
--                total }
-- Newest month first; `id` breaks ties so paging is deterministic.
-- ---------------------------------------------------------------------------
create or replace function public.my_submission_history(
  p_limit  integer default 12,
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
  v_limit  integer := least(greatest(coalesce(p_limit, 12), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_result jsonb;
begin
  if v_member is null then
    raise exception 'Only members can read their submissions'
      using errcode = 'insufficient_privilege';
  end if;

  with mine as (
    select s.*, p.period_month
    from member_submissions s
    join submission_periods p on p.id = s.period_id
    where s.member_id = v_member
  ),
  page as (
    select * from mine
    order by period_month desc, id desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from mine),
    'rows', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'periodMonth', pg.period_month,
                 'submission', to_jsonb(s),
                 'quantities', coalesce((
                   select jsonb_object_agg(l.material_type_id, l.quantity)
                   from member_submission_lines l
                   where l.member_submission_id = pg.id
                 ), '{}'::jsonb)
               )
               order by pg.period_month desc, pg.id desc
             )
      from page pg
      join member_submissions s on s.id = pg.id
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- supplier_item_counts(p_supplier_ids) — Super Admin only
-- One row per requested supplier that lists anything; absent = zero.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_item_counts(p_supplier_ids uuid[])
returns table (supplier_id uuid, item_count integer, orderable_count integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_super_admin();

  if coalesce(cardinality(p_supplier_ids), 0) > 100 then
    raise exception 'Too many suppliers requested at once'
      using errcode = 'check_violation';
  end if;

  return query
    select si.supplier_id,
           count(*)::integer,
           (count(*) filter (where si.sell_price is not null))::integer
    from supplier_items si
    where si.supplier_id = any (coalesce(p_supplier_ids, '{}'::uuid[]))
    group by si.supplier_id;
end;
$$;

revoke all on function public.admin_submission_month(date) from public, anon;
grant execute on function public.admin_submission_month(date) to authenticated, service_role;
revoke all on function public.my_submission_history(integer, integer) from public, anon;
grant execute on function public.my_submission_history(integer, integer)
  to authenticated, service_role;
revoke all on function public.supplier_item_counts(uuid[]) from public, anon;
grant execute on function public.supplier_item_counts(uuid[]) to authenticated, service_role;
