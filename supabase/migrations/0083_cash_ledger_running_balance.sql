-- ============================================================================
-- 0083_cash_ledger_running_balance
-- The cash ledger's Balance column, computed in the order the ledger is shown.
--
-- cash_entries.balance_after is the treasury balance at the moment an entry was
-- POSTED. The ledger lists entries by occurred_at — the date the admin picked,
-- which may be in the past. So a backdated entry (recorded on the 30th, dated
-- the 25th) lands among older rows carrying a balance that already includes
-- every entry posted before it, and the column stops adding up row to row.
-- Reversals make it worse within a day: they are stamped now(), while a picked
-- date is stored as midnight UTC.
--
--   cash_ledger_page(direction, category, source, limit, offset)
--     One page of the ledger in the display order (occurred_at, created_at, id
--     — newest first), each row carrying `running_balance`: the signed sum of
--     every entry at or before it in that same order, over the WHOLE ledger.
--     Filters narrow which rows come back, never what the balance sums, so a
--     filtered row shows the same balance it shows unfiltered. The newest row's
--     running_balance equals cash_account.balance.
--
-- Read-only and additive: no table, policy, index or existing function
-- changes. balance_after stays as recorded — it is what the entry detail page
-- shows, labelled as the balance when recorded.
-- ============================================================================

create or replace function public.cash_ledger_page(
  p_direction cash_direction    default null,
  p_category  cash_category     default null,
  p_source    cash_entry_source default null,
  p_limit     integer           default 25,
  p_offset    integer           default 0
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

  with ledger as (
    select e.*,
           sum(case when e.direction = 'IN' then e.amount else -e.amount end)
             over (order by e.occurred_at, e.created_at, e.id
                   rows between unbounded preceding and current row)
             as running_balance
    from cash_entries e
  ),
  filtered as (
    select *
    from ledger l
    where (p_direction is null or l.direction = p_direction)
      and (p_category  is null or l.category  = p_category)
      and (p_source    is null or l.source    = p_source)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(pg)
                       order by pg.occurred_at desc, pg.created_at desc, pg.id desc)
      from (
        select * from filtered
        order by occurred_at desc, created_at desc, id desc
        limit v_limit offset v_offset
      ) pg
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.cash_ledger_page(cash_direction, cash_category, cash_entry_source, integer, integer)
  from public, anon;
grant execute on function public.cash_ledger_page(cash_direction, cash_category, cash_entry_source, integer, integer)
  to authenticated, service_role;
