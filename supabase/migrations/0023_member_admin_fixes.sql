-- ============================================================================
-- 0023_member_admin_fixes
-- Two things:
--   1. guard_member_self_update() also fired for the service-role admin client
--      (triggers are not bypassed by service_role — only RLS is). With no
--      end-user JWT, app.is_super_admin() is false inside the trigger, so every
--      admin change to rank / role / status raised "Members may only change
--      their own display name". Let trusted server contexts through; the server
--      action layer already gates these on requireSuperAdmin().
--   2. New audit_action value for permanent member deletion (used from the
--      server action, never in this transaction — safe to add here).
-- ============================================================================

create or replace function app.guard_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No end-user identity on the connection => trusted server code (the
  -- service-role admin client). Those privileged member writes are authorised
  -- in the server action layer (requireSuperAdmin), not here.
  if auth.uid() is null or app.is_super_admin() then
    return new;
  end if;

  if new.user_id  is distinct from old.user_id
     or new.username is distinct from old.username
     or new.rank     is distinct from old.rank
     or new.role     is distinct from old.role
     or new.status   is distinct from old.status
  then
    raise exception 'Members may only change their own display name'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

alter type audit_action add value if not exists 'MEMBER_DELETED';
