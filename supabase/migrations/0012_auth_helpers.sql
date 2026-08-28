-- ============================================================================
-- 0012_auth_helpers
-- SECURITY DEFINER predicates used by RLS policies and RPC functions. Defined
-- as definer so they can read `members` without tripping members' own RLS
-- (avoids recursive-policy errors).
-- ============================================================================

-- The application member row for the current authenticated user, or NULL.
create or replace function app.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id
  from members m
  where m.user_id = auth.uid();
$$;

-- True only for an ACTIVE Super Admin. INACTIVE admins get nothing (PRD §4).
create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from members m
    where m.user_id = auth.uid()
      and m.role = 'SUPER_ADMIN'
      and m.status = 'ACTIVE'
  );
$$;

-- True for any ACTIVE member (any role). Used to gate order creation.
create or replace function app.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from members m
    where m.user_id = auth.uid()
      and m.status = 'ACTIVE'
  );
$$;

grant usage on schema app to authenticated, service_role;
grant execute on function app.current_member_id() to authenticated, service_role;
grant execute on function app.is_super_admin() to authenticated, service_role;
grant execute on function app.is_active_member() to authenticated, service_role;
