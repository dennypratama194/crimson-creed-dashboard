import "server-only";

import { createLocalLimiter, type RateLimitRule } from "@/lib/rate-limit-local";
import { createAdminClient } from "@/lib/supabase/admin";

export type { RateLimitRule };

/**
 * Shared sliding-window rate limiter, backed by the `hit_auth_throttle` /
 * `clear_auth_throttle` RPCs (migrations 0022 / 0047). Built for the auth
 * endpoints; also used to cap how fast an authenticated member can hammer the
 * mutating server actions — order / production / submission writes each fan a
 * notification out to every Super Admin, so they are the abuse paths worth
 * bounding.
 *
 * When the RPC is unavailable (network, service key absent, migration missing)
 * the caller picks what happens, and the failure is logged either way:
 *  - `"open"` (default, member actions): allow. These actions are already
 *    authenticated and RLS/RPC-authorized; the limiter only bounds spam.
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

/**
 * One-liner for server actions: returns an error string when the caller is
 * rate-limited, or null when the call may proceed.
 */
export async function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  message = "You're doing that too fast.",
): Promise<string | null> {
  const wait = await rateLimitHit(key, rule);
  return wait > 0 ? retryAfterMessage(message, wait) : null;
}
