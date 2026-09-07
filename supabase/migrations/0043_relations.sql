-- ============================================================================
-- 0043_relations
-- Relations: a lightweight directory of people and crews connected to the
-- organisation but outside the member roster (contacts, liaisons, officials).
-- Super Admin only — members never see it (RLS below). Nothing references a
-- relation historically, so there is no soft delete; v1 is add + edit only.
-- Mirrors the shape of the Suppliers module (0029 / 0031).
-- ============================================================================

create table relations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  joined_on   date not null default current_date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint relations_name_not_blank check (length(trim(name)) >= 1)
);

comment on table relations is 'Directory of external contacts / associated crews. Super Admin only; not referenced by orders or any other table.';

create index relations_name_idx on relations (lower(name));
create index relations_joined_on_idx on relations (joined_on desc);

create trigger relations_set_updated_at
  before update on relations
  for each row execute function app.set_updated_at();

-- ── RLS: SELECT only, Super Admin only. Every write goes through the
-- SECURITY DEFINER RPCs in 0044. service_role bypasses RLS (seed script).
-- Mirrors 0031_supplier_rls.sql.
alter table relations enable row level security;

revoke all on table relations from authenticated, anon;
grant select on table relations to authenticated;

create policy relations_admin_select on relations
  for select to authenticated
  using (app.is_super_admin());
