-- ============================================================================
-- 0011_settings
-- Single-row organization settings (PRD §31). Theme is a per-user client
-- preference and is intentionally not stored here.
-- ============================================================================

create table organization_settings (
  id          boolean primary key default true,
  org_name    text not null default 'Crimson Creed',
  logo_url    text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references members (id) on delete set null,
  constraint organization_settings_singleton check (id)
);

insert into organization_settings (id) values (true);

create trigger organization_settings_set_updated_at
  before update on organization_settings
  for each row execute function app.set_updated_at();

create or replace function app.forbid_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Rows in %.% cannot be deleted', tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create trigger organization_settings_no_delete
  before delete on organization_settings
  for each row execute function app.forbid_delete();
