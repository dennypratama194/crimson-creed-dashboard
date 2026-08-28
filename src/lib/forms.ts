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
 * Surface a Supabase/Postgres error. Our RPCs raise human-readable messages, so
 * pass those through; fall back for anything unexpected or oversized.
 */
export function rpcErrorMessage(
  error: { message?: string } | null | undefined,
  fallback: string,
): string {
  const message = error?.message?.trim();
  if (!message) return fallback;
  if (
    message.length > 180 ||
    /syntax error|permission denied for/i.test(message)
  ) {
    return fallback;
  }
  return message;
}
