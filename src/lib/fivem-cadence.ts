/**
 * How often the FiveM monitor polls `/api/fivem`, as a pure function so the
 * cadence can be tested without a browser. Not `server-only`: the monitor runs
 * it on every refetch decision.
 */
import {
  FIVEM_DIRECTORY_REFRESH_INTERVAL_MS,
  FIVEM_ERROR_REFRESH_MAX_MS,
  FIVEM_OFFLINE_REFRESH_INTERVAL_MS,
  FIVEM_REFRESH_INTERVAL_MS,
} from "@/lib/constants/fivem";
import type { FivemSnapshot } from "@/lib/validation/fivem";

/**
 * - `/api/fivem` itself failing: the offline cadence, doubled per consecutive
 *   failure, capped at `FIVEM_ERROR_REFRESH_MAX_MS`.
 * - Directory-sourced snapshot: slow, **even when it says online** — the
 *   directory lags by minutes and carries no roster to keep current.
 * - Offline: the offline cadence (the server applies its own upstream backoff).
 * - The game server answering directly: the live cadence.
 */
export function fivemRefreshInterval(
  snapshot: Pick<FivemSnapshot, "online" | "source"> | undefined,
  consecutiveErrors = 0,
): number {
  if (consecutiveErrors > 0) {
    const exponent = Math.min(consecutiveErrors - 1, 16);
    return Math.min(
      FIVEM_ERROR_REFRESH_MAX_MS,
      FIVEM_OFFLINE_REFRESH_INTERVAL_MS * 2 ** exponent,
    );
  }
  if (!snapshot) return FIVEM_OFFLINE_REFRESH_INTERVAL_MS;
  if (snapshot.source === "directory") {
    return FIVEM_DIRECTORY_REFRESH_INTERVAL_MS;
  }
  return snapshot.online
    ? FIVEM_REFRESH_INTERVAL_MS
    : FIVEM_OFFLINE_REFRESH_INTERVAL_MS;
}

/** `30000` -> "30s", `120000` -> "2 min". */
export function formatCadence(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}
