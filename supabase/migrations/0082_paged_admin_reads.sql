-- ============================================================================
-- 0082_paged_admin_reads
-- Paged, SQL-joined replacements for three Super Admin views that still
-- shipped their whole population to the app on every render:
--
--   admin_submission_month_page(month, limit, offset)
--     /admin/submissions rendered one row per member from
--     admin_submission_month (0080) — every active member plus stragglers, each
--     with notes and timestamps the grid never shows. This returns one page of
--     the same grid (same population, same order) and only the fields the grid
--     uses, while totals and status counts still cover the WHOLE month.
--     Serves: member_submissions (period_id) [member_submissions_period_idx],
--             member_submission_lines (member_submission_id)
--             [member_submission_lines_submission_idx].
--
--   supplier_catalogue_page(supplier, limit, offset)
--     The supplier detail page read every price-book line in batches, joined
--     the items in id chunks and sorted in JavaScript. Now one page, joined
--     and ordered in SQL, with the full line and "sold to members" counts.
--     Serves: supplier_items (supplier_id) [supplier_items_supplier_idx].
--
--   supplier_catalogue_groups(limit, offset, lines per supplier)
--     The "By supplier" view bounded the suppliers (10 a page) but not their
--     lines: each card carried its supplier's complete catalogue. Now each
--     card carries at most `lines per supplier` lines plus the real total,
--     and links to the paged detail page for the rest.
--     Serves: suppliers (name) order via a scan of a small table; lines per
--             card via supplier_items_supplier_idx.
--
--   supplier_available_items(supplier, search, limit, offset)
--     The "Add item" picker was every non-archived item, loaded with the page
--     whether or not the dialog opened, and filtered against the lines on the
--     page. Now searched and paged on demand, excluding everything already in
--     that supplier's catalogue — not just what is on screen.
--     Serves: supplier_items (supplier_id, item_id) [supplier_items_unique_pair].
--
-- Read-only and additive: no table, policy, index or existing function
-- changes. admin_submission_month (0080) is left in place so the app build
-- that is live while this migration runs keeps working.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- admin_submission_month_page(p_period_month, p_limit, p_offset) — Super Admin
-- Shape: jsonb {
--   hasPeriod: boolean,
--   targets:   { <material_type_id>: target_quantity },
--   total:     rows in the whole grid (for the pager),
--   rows: [ { memberId, memberName, rank, active, submissionId, status,
--             receivedById, receivedByName,
--             quantities: { <material_type_id>: quantity } } ],   -- one page
--   totals:    { <material_type_id>: sum over EVERY submission of the month },
--   counts:    { members, confirmed, pending, rejected, missing }  -- whole grid
-- }
-- Same population and order as admin_submission_month: every ACTIVE member,
-- then members who submitted for the month but are no longer active, each in
-- (display_name, id) order. member_id is unique in the grid (one submission
-- per member per period), so paging never repeats or skips a row.
-- Never creates the period.
-- ---------------------------------------------------------------------------
create or replace function public.admin_submission_month_page(
  p_period_month date,
  p_limit        integer default 25,
  p_offset       integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_period_id uuid;
  v_limit     integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset    integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
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
    select s.id, s.member_id, s.status, s.received_by, s.received_by_name
    from member_submissions s
    where s.period_id = v_period_id
  ),
  grid as (
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
  graded as (
    select g.*, s.id as submission_id, s.status, s.received_by,
           s.received_by_name
    from grid g
    left join subs s on s.member_id = g.member_id
  ),
  page as (
    select * from graded
    order by bucket, sort_name, member_id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'hasPeriod', v_period_id is not null,
    'targets', coalesce((
      select jsonb_object_agg(t.material_type_id, t.target_quantity)
      from submission_period_targets t
      where t.period_id = v_period_id
    ), '{}'::jsonb),
    'total', (select count(*) from graded),
    'rows', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'memberId', p.member_id,
                 'memberName', p.member_name,
                 'rank', p.rank,
                 'active', p.active,
                 'submissionId', p.submission_id,
                 'status', p.status,
                 'receivedById', p.received_by,
                 'receivedByName', p.received_by_name,
                 'quantities', coalesce((
                   select jsonb_object_agg(l.material_type_id, l.quantity)
                   from member_submission_lines l
                   where l.member_submission_id = p.submission_id
                 ), '{}'::jsonb)
               )
               order by p.bucket, p.sort_name, p.member_id
             )
      from page p
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
        'confirmed', count(*) filter (where g.status = 'CONFIRMED'),
        'pending',   count(*) filter (where g.status = 'PENDING'),
        'rejected',  count(*) filter (where g.status = 'REJECTED'),
        'missing',   count(*) filter (where g.status is null)
      )
      from graded g
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- app.supplier_line_json(line, item) — one price-book line with its item, the
-- shape both catalogue RPCs return. Internal: the `app` schema is not exposed
-- through PostgREST, and only the definer RPCs below (running as the owner)
-- call it, so nobody else is granted execute. `stable`, not `immutable`:
-- timestamptz renders in the session's time zone.
-- ---------------------------------------------------------------------------
create or replace function app.supplier_line_json(
  p_line supplier_items,
  p_item items
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select to_jsonb(p_line) || jsonb_build_object(
    'item', jsonb_build_object(
      'name', p_item.name,
      'category', p_item.category,
      'unit', p_item.unit,
      'image_url', p_item.image_url,
      'active', p_item.active,
      'orderable', p_item.orderable
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- supplier_catalogue_page(p_supplier_id, p_limit, p_offset) — Super Admin
-- Shape: jsonb { total, soldToMembers, rows: [ <supplier_items row> + item ] }
-- Lines in (item category, item name, line id) order; id makes it unique.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_catalogue_page(
  p_supplier_id uuid,
  p_limit       integer default 25,
  p_offset      integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_result jsonb;
begin
  perform app.require_super_admin();

  if p_supplier_id is null then
    raise exception 'Choose a supplier' using errcode = 'check_violation';
  end if;

  select jsonb_build_object(
    'total', (
      select count(*) from supplier_items si where si.supplier_id = p_supplier_id
    ),
    'soldToMembers', (
      select count(*) from supplier_items si
      where si.supplier_id = p_supplier_id and si.sell_price is not null
    ),
    'rows', coalesce((
      select jsonb_agg(pg.line order by pg.category, pg.name, pg.id)
      from (
        select app.supplier_line_json(si, i) as line,
               i.category::text as category, i.name, si.id
        from supplier_items si
        join items i on i.id = si.item_id
        where si.supplier_id = p_supplier_id
        order by i.category::text, i.name, si.id
        limit v_limit offset v_offset
      ) pg
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- supplier_catalogue_groups(p_limit, p_offset, p_lines) — Super Admin
-- Shape: jsonb { total, groups: [ { supplier: <suppliers row>, lineCount,
--                                   lines: [ <line> + item ] } ] }
-- Non-archived suppliers in (name, id) order; each carries its first `p_lines`
-- lines in the catalogue order above, and lineCount is its full total.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_catalogue_groups(
  p_limit  integer default 10,
  p_offset integer default 0,
  p_lines  integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_lines  integer := least(greatest(coalesce(p_lines, 10), 1), 50);
  v_result jsonb;
begin
  perform app.require_super_admin();

  with page as (
    select s.*
    from suppliers s
    where s.archived_at is null
    order by s.name, s.id
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from suppliers s where s.archived_at is null),
    'groups', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'supplier', to_jsonb(p),
                 'lineCount', (
                   select count(*) from supplier_items si
                   where si.supplier_id = p.id
                 ),
                 'lines', coalesce((
                   select jsonb_agg(l.line order by l.category, l.name, l.id)
                   from (
                     select app.supplier_line_json(si, i) as line,
                            i.category::text as category, i.name, si.id
                     from supplier_items si
                     join items i on i.id = si.item_id
                     where si.supplier_id = p.id
                     order by i.category::text, i.name, si.id
                     limit v_lines
                   ) l
                 ), '[]'::jsonb)
               )
               order by p.name, p.id
             )
      from page p
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- supplier_available_items(p_supplier_id, p_search, p_limit, p_offset)
-- Super Admin. Shape: jsonb { total, rows: [ { id, name, category } ] }
-- Non-archived items this supplier does not list yet (anywhere in its
-- catalogue), optionally filtered by a case-insensitive name fragment
-- (LIKE wildcards in the input are matched literally), in (name, id) order.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_available_items(
  p_supplier_id uuid,
  p_search      text default null,
  p_limit       integer default 20,
  p_offset      integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit   integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset  integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_search  text := nullif(btrim(left(coalesce(p_search, ''), 80)), '');
  v_pattern text;
  v_result  jsonb;
begin
  perform app.require_super_admin();

  if p_supplier_id is null then
    raise exception 'Choose a supplier' using errcode = 'check_violation';
  end if;

  if v_search is not null then
    v_pattern := '%' || replace(replace(replace(v_search,
                   '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with available as (
    select i.id, i.name, i.category
    from items i
    where i.archived_at is null
      and (v_pattern is null or i.name ilike v_pattern escape '\')
      and not exists (
        select 1 from supplier_items si
        where si.supplier_id = p_supplier_id and si.item_id = i.id
      )
  )
  select jsonb_build_object(
    'total', (select count(*) from available),
    'rows', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', a.id, 'name', a.name,
                                  'category', a.category)
               order by a.name, a.id
             )
      from (
        select * from available
        order by name, id
        limit v_limit offset v_offset
      ) a
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function app.supplier_line_json(supplier_items, items)
  from public, anon, authenticated;

revoke all on function public.admin_submission_month_page(date, integer, integer)
  from public, anon;
grant execute on function public.admin_submission_month_page(date, integer, integer)
  to authenticated, service_role;
revoke all on function public.supplier_catalogue_page(uuid, integer, integer)
  from public, anon;
grant execute on function public.supplier_catalogue_page(uuid, integer, integer)
  to authenticated, service_role;
revoke all on function public.supplier_catalogue_groups(integer, integer, integer)
  from public, anon;
grant execute on function public.supplier_catalogue_groups(integer, integer, integer)
  to authenticated, service_role;
revoke all on function public.supplier_available_items(uuid, text, integer, integer)
  from public, anon;
grant execute on function public.supplier_available_items(uuid, text, integer, integer)
  to authenticated, service_role;
