/**
 * FiveM live-server monitor config.
 *
 * The proxy (`/api/fivem`) tries the server's own HTTP endpoints first and falls
 * back to the Cfx.re master list:
 *
 *   1. GET {FIVEM_DIRECT_ENDPOINT}/dynamic.json | players.json | info.json
 *      Real player names. Works from any network the server's firewall allows
 *      (a dev machine, a self-host) but datacenter IPs (Vercel) are blackholed,
 *      so this attempt is given a short timeout.
 *   2. GET {FIVEM_MASTER_API_BASE}/{joinCode}
 *      Always reachable from Vercel, but aggregate-only: player names come back
 *      anonymised ("AnonN"). Used whenever step 1 times out or fails.
 */

/** Base URL of the server's own HTTP port. Override with `FIVEM_SERVER_URL`. */
export const FIVEM_DIRECT_ENDPOINT = "http://main.imeroleplay.com:30120";

/**
 * Timeout for the direct attempt. Kept short: on a datacenter IP the port is
 * blackholed, and we want to fail over to the master list quickly, not hang.
 */
export const FIVEM_DIRECT_TIMEOUT_MS = 2500;

/** Cfx.re master-list single-server endpoint. Append `/{joinCode}`. */
export const FIVEM_MASTER_API_BASE =
  "https://frontend.cfx-services.net/api/servers/single";

/** Join code for the master-list fallback. Override with `FIVEM_JOIN_CODE`. */
export const FIVEM_DEFAULT_JOIN_CODE = "zrvmg4";

/** How long the proxy waits on the master list before giving up. */
export const FIVEM_FETCH_TIMEOUT_MS = 8000;

/** Client auto-refresh cadence when the toggle is on. */
export const FIVEM_REFRESH_INTERVAL_MS = 10_000;

/** How many player rows to render before the "Show more" control. */
export const FIVEM_PLAYERS_PER_PAGE = 20;

export const FIVEM_LABELS = {
  online: "Online",
  offline: "Offline",
} as const;
