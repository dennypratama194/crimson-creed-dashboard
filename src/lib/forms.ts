export type FormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export const IDLE_FORM_STATE: FormState = { ok: false };

/** First message per top-level field path, from a ZodError's issues. */
export function fieldErrorsFrom(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * SQLSTATE codes our RPCs raise on purpose — either a bare `RAISE EXCEPTION`
 * (P0001) or an explicit `USING ERRCODE`. Anything outside this set is an
 * unexpected DB error whose text can name internal schema objects.
 */
const INTENTIONAL_ERROR_CODES = new Set([
  "P0001", // raise_exception (plain RAISE)
  "P0002", // no_data_found
  "23514", // check_violation
  "23503", // foreign_key_violation
  "42501", // insufficient_privilege
  "CC429", // project-defined: per-member mutation quota (0079)
]);

/** System-generated phrasings that leak constraint / column / type internals. */
const LEAKY_MESSAGE =
  /violates (?:check|foreign key|not-null|unique) constraint|column .+ does not exist|relation .+ does not exist|function .+ does not exist|syntax error|permission denied|invalid input (?:syntax|value)|value .+ out of range|numeric field overflow/i;

/**
 * Surface a Supabase/Postgres error. Our RPCs raise human-readable messages, so
 * pass those through; fall back for anything unexpected, oversized, or carrying
 * a code / phrasing that marks it as a raw database error.
 */
export function rpcErrorMessage(
  error: { message?: string; code?: string } | null | undefined,
  fallback: string,
): string {
  const message = error?.message?.trim();
  if (!message) return fallback;
  if (error?.code && !INTENTIONAL_ERROR_CODES.has(error.code)) return fallback;
  if (message.length > 180 || LEAKY_MESSAGE.test(message)) return fallback;
  return message;
}
