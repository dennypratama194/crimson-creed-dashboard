-- ============================================================================
-- 0052_pin_function_search_path
-- Supabase Security Advisor — "Function Search Path Mutable".
--
-- Seven helpers in the `app` schema were created before the house rule that
-- every function pins `SET search_path`. Every RPC from 0012 onward already
-- carries `set search_path = public, pg_temp`; these seven (triggers + two
-- pure-SQL helpers + the Super-Admin gate) predate it and were missed.
--
-- ALTER FUNCTION only — no body is re-declared, so there is no behavioural
-- change and nothing to smoke-test beyond "writes still work". `ALTER FUNCTION
-- ... SET` is idempotent, so this migration is safe to re-run.
--
--   app.set_updated_at()                          trigger      (0001)
--   app.reject_mutation()                         trigger      (0001)
--   app.forbid_delete()                           trigger      (0011)
--   app.guard_notification_update()               trigger      (0008)
--   app.cash_category_direction(cash_category)    pure sql     (0025)
--   app.submission_line_qty(jsonb, uuid)          pure sql     (0034)
--   app.require_super_admin()                     authz gate   (0013)
-- ============================================================================

alter function app.set_updated_at()
  set search_path = public, pg_temp;

alter function app.reject_mutation()
  set search_path = public, pg_temp;

alter function app.forbid_delete()
  set search_path = public, pg_temp;

alter function app.guard_notification_update()
  set search_path = public, pg_temp;

alter function app.cash_category_direction(public.cash_category)
  set search_path = public, pg_temp;

alter function app.submission_line_qty(jsonb, uuid)
  set search_path = public, pg_temp;

alter function app.require_super_admin()
  set search_path = public, pg_temp;
