-- ============================================================================
-- 0016_settings_rpc
-- Organization settings update (Super Admin) with audit.
-- ============================================================================

create or replace function public.update_organization_settings(
  p_org_name text,
  p_logo_url text default null
)
returns organization_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := app.current_member_id();
  v_old   organization_settings;
  v_new   organization_settings;
begin
  perform app.require_super_admin();

  if coalesce(btrim(p_org_name), '') = '' then
    raise exception 'Organization name is required' using errcode = 'check_violation';
  end if;

  select * into v_old from organization_settings where id = true;

  update organization_settings
  set org_name = btrim(p_org_name),
      logo_url = nullif(btrim(p_logo_url), ''),
      updated_by = v_actor
  where id = true
  returning * into v_new;

  insert into activity_logs (actor_id, verb, summary, reference_type, reference_id)
  values (v_actor, 'settings.updated', 'Updated organization settings', 'MANUAL', null);

  insert into audit_logs (actor_id, action, entity_type, entity_id, old_values, new_values)
  values (v_actor, 'SETTINGS_UPDATED', 'organization_settings', null,
          jsonb_build_object('org_name', v_old.org_name, 'logo_url', v_old.logo_url),
          jsonb_build_object('org_name', v_new.org_name, 'logo_url', v_new.logo_url));

  return v_new;
end;
$$;

revoke all on function public.update_organization_settings(text, text) from public, anon;
grant execute on function public.update_organization_settings(text, text)
  to authenticated, service_role;
