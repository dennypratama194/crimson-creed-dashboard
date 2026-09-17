import "server-only";

import { createLocalLimiter, type RateLimitRule } from "@/lib/rate-limit-local";
import { createAdminClient } from "@/lib/supabase/admin";

export type { RateLimitRule };

/**
 * Shared fixed-window rate limiter for the AUTH endpoints (sign-in, password
 * change), backed by the `hit_auth_throttle` / `clear_auth_throttle` RPCs
 * (0022, made concurrency-safe in 0078). A window opens on the first hit and
 * lasts `windowSeconds`; the hit after `limit` blocks the key for
 * `blockSeconds`. It is not a sliding window.
 *
 * Member mutations (orders, payments, cancellations, submissions) are NOT
 * throttled here. Their quotas live inside the RPCs themselves (0079), because
 * a limit that only the Server Action checks is skipped by any member calling
 * PostgREST directly. Keep the two separate: this one protects credentials
 * before a session exists; that one bounds what a session may write.
 *
 * When the RPC is unavailable (network, service key absent, migration missing)
 * the caller picks what happens, and the failure is logged either way:
 *  - `"open"` (default): allow. For a caller that is already authenticated
 *    and RLS/RPC-authorized, where the limiter only bounds spam.
 *  - `"local"` (auth endpoints): fall back to an in-process limiter so a
 *    database outage does not silently remove brute-force protection. It is
 *    deliberately not fail-closed — that would lock every member out of the
 *    app for the length of the outage.
 * The limiter is never an authorization boundary.
 */

export type RateLimitFallback = "open" | "local";

const localLimiter = createLocalLimiter();

/** Records one hit against `key`. Returns seconds to wait (0 = allowed). */
export async function rateLimitHit(
  key: string,
  rule: RateLimitRule,
  onUnavailable: RateLimitFallback = "open",
): Promise<number> {
  const windowSeconds = rule.windowSeconds ?? 60;
  const blockSeconds = rule.blockSeconds ?? windowSeconds;
  const fallback = () =>
    onUnavailable === "local" ? localLimiter.hit(key, rule) : 0;
  try {
    const { data, error } = await createAdminClient().rpc("hit_auth_throttle", {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: windowSeconds,
      p_block_seconds: blockSeconds,
    });
    if (error || typeof data !== "number") {
      console.error("[rate-limit] limiter unavailable", error ?? "no result");
      return fallback();
    }
    return data;
  } catch (err) {
    console.error("[rate-limit] limiter threw", err);
    return fallback();
  }
}

/** Resets a counter after a legitimate success. Best-effort. */
export async function rateLimitClear(key: string): Promise<void> {
  localLimiter.clear(key);
  try {
    await createAdminClient().rpc("clear_auth_throttle", { p_key: key });
  } catch {
    // ignore — the counter expires on its own window
  }
}

/** "<prefix> Try again in about N minutes." */
export function retryAfterMessage(prefix: string, waitSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(waitSeconds / 60));
  return `${prefix} Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
