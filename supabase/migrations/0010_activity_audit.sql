-- ============================================================================
-- 0010_activity_audit
-- activity_logs : human-readable feed for dashboards / admin activity page.
-- audit_logs    : detailed append-only record for sensitive actions (PRD §18).
-- ============================================================================

create table activity_logs (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid references members (id) on delete set null,
  verb            text not null,
  summary         text not null,
  reference_type  reference_type,
  reference_id    uuid,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index activity_logs_created_at_idx on activity_logs (created_at desc);
create index activity_logs_reference_idx on activity_logs (reference_type, reference_id);

create trigger activity_logs_no_change
  before update or delete on activity_logs
  for each row execute function app.reject_mutation();

create table audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references members (id) on delete set null,
  action       audit_action not null,
  entity_type  text not null,
  entity_id    uuid,
  old_values   jsonb,
  new_values   jsonb,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index audit_logs_created_at_idx on audit_logs (created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_action_idx on audit_logs (action);

create trigger audit_logs_no_change
  before update or delete on audit_logs
  for each row execute function app.reject_mutation();
