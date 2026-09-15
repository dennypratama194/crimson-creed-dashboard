-- ============================================================================
-- 0066_distribution_summary
-- The "who owes what" strip on /admin/distribution is gone, and with it the
-- only caller of distribution_outstanding_by_member(). The board now shows
-- three org-wide totals instead: submitted (handed back), outstanding (still
-- owed) and the number of drawable items.
--
-- distribution_summary() is the SQL-side aggregate behind the first two — the
-- same shape as my_distribution_summary() (0061) but org-wide and Super Admin
-- gated, so a member can never total the organisation.
-- ============================================================================

create or replace function public.distribution_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_super_admin();

  return (
    select jsonb_build_object(
      'openDraws',     coalesce(count(*) filter (where status = 'OPEN'), 0),
      'openAmount',    coalesce(sum(amount_owed) filter (where status = 'OPEN'), 0),
      'settledDraws',  coalesce(count(*) filter (where status = 'SETTLED'), 0),
      'settledAmount', coalesce(sum(amount_owed) filter (where status = 'SETTLED'), 0)
    )
    from distributions
  );
end;
$$;

revoke all on function public.distribution_summary() from public, anon;
grant execute on function public.distribution_summary()
  to authenticated, service_role;

-- Superseded by the aggregate above; nothing reads the per-member breakdown.
drop function if exists public.distribution_outstanding_by_member();
