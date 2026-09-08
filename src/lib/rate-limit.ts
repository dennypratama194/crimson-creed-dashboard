import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Shared sliding-window rate limiter, backed by the `hit_auth_throttle` /
 * `clear_auth_throttle` RPCs (migrations 0022 / 0047). Built for the auth
 * endpoints; also used to cap how fast an authenticated member can hammer the
 * mutating server actions — order / production / submission writes each fan a
 * notification out to every Super Admin, so they are the abuse paths worth
 * bounding.
 *
 * Best-effort by design: any failure (RPC missing, service key absent, network)
 * fails OPEN so a broken limiter never blocks legitimate work. Failures are
 * logged so an outage is visible in platform logs.
 */

export type RateLimitRule = {
  /** Max attempts allowed inside the window before the block kicks in. */
  limit: number;
  /** Rolling window, seconds. Default 60. */
  windowSeconds?: number;
  /** How long a tripped limiter stays blocked, seconds. Default = windowSeconds. */
  blockSeconds?: number;
};

/** Records one hit against `key`. Returns seconds to wait (0 = allowed). */
export async function rateLimitHit(
  key: string,
  rule: RateLimitRule,
): Promise<number> {
  const windowSeconds = rule.windowSeconds ?? 60;
  const blockSeconds = rule.blockSeconds ?? windowSeconds;
  try {
    const { data, error } = await createAdminClient().rpc("hit_auth_throttle", {
      p_key: key,
      p_limit: rule.limit,
      p_window_seconds: windowSeconds,
      p_block_seconds: blockSeconds,
    });
    if (error || typeof data !== "number") {
      if (error) console.error("[rate-limit] limiter unavailable", error);
      return 0;
    }
    return data;
  } catch (err) {
    console.error("[rate-limit] limiter threw", err);
    return 0;
  }
}

/** Resets a counter after a legitimate success. Best-effort. */
export async function rateLimitClear(key: string): Promise<void> {
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
