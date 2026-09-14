export type RateLimitRule = {
  /** Max attempts allowed inside the window before the block kicks in. */
  limit: number;
  /** Rolling window, seconds. Default 60. */
  windowSeconds?: number;
  /** How long a tripped limiter stays blocked, seconds. Default = windowSeconds. */
  blockSeconds?: number;
};

type Bucket = {
  attempts: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
};

export type LocalLimiter = {
  /** Records one hit. Returns seconds to wait (0 = allowed). */
  hit(key: string, rule: RateLimitRule): number;
  clear(key: string): void;
};

/**
 * In-process limiter with the same window / block semantics as the
 * `hit_auth_throttle` RPC (migrations 0022 / 0047). It is only a fallback for
 * when that RPC is unreachable: state lives in one server instance's memory, so
 * on a multi-instance deployment an attacker spread across instances gets
 * `limit` attempts per instance. That is still far better than no limit at all,
 * and — unlike failing closed — it never locks every member out during a
 * database outage.
 */
export function createLocalLimiter(
  options: { maxKeys?: number; now?: () => number } = {},
): LocalLimiter {
  const buckets = new Map<string, Bucket>();
  const maxKeys = options.maxKeys ?? 10_000;
  const now = options.now ?? Date.now;

  return {
    hit(key, rule) {
      const windowMs = (rule.windowSeconds ?? 60) * 1000;
      const blockMs = (rule.blockSeconds ?? rule.windowSeconds ?? 60) * 1000;
      const t = now();
      const bucket = buckets.get(key);

      if (!bucket) {
        // Bounded memory: drop the oldest-inserted key once full.
        if (buckets.size >= maxKeys) {
          const oldest = buckets.keys().next().value;
          if (oldest !== undefined) buckets.delete(oldest);
        }
        buckets.set(key, {
          attempts: 1,
          firstAttemptAt: t,
          blockedUntil: null,
        });
        return 0;
      }

      if (bucket.blockedUntil !== null && bucket.blockedUntil > t) {
        return Math.ceil((bucket.blockedUntil - t) / 1000);
      }

      if (bucket.firstAttemptAt < t - windowMs) {
        bucket.attempts = 1;
        bucket.firstAttemptAt = t;
        bucket.blockedUntil = null;
        return 0;
      }

      bucket.attempts += 1;
      if (bucket.attempts > rule.limit) {
        bucket.blockedUntil = t + blockMs;
        return Math.ceil(blockMs / 1000);
      }
      return 0;
    },

    clear(key) {
      buckets.delete(key);
    },
  };
}
