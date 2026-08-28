-- ============================================================================
-- 0001_init_helpers
-- Shared schema + trigger helpers used by later migrations.
-- ============================================================================

create schema if not exists app;
comment on schema app is 'Internal helpers (auth predicates, triggers). Not exposed via PostgREST.';

-- Keep updated_at columns current on UPDATE.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Block UPDATE/DELETE entirely (used to make append-only tables immutable to
-- everyone except the postgres/service role, which bypasses triggers via
-- session_replication_role only when explicitly set — normal writes are denied).
create or replace function app.reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Table %.% is append-only', tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;
