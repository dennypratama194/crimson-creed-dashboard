/**
 * FiveM live-server monitor config. The proxy (`/api/fivem`) reads the server's
 * own public HTTP endpoints on the game port:
 *
 *   GET {endpoint}/dynamic.json  -> { clients, sv_maxclients, hostname, ... }
 *   GET {endpoint}/players.json  -> [{ id, name, ping, identifiers }]
 *   GET {endpoint}/info.json     -> { vars: { sv_projectName, ... }, ... }
 *
 * Override the endpoint with `FIVEM_SERVER_URL` (server-only). If the server is
 * unreachable the page shows it as offline.
 */

// HTTPS, not HTTP: the plain-HTTP endpoint sits on the raw game-server IP, which
// datacenter networks (Vercel) get blackholed on. Port 30120 also answers HTTPS
// behind a proxy/CDN that accepts connections from anywhere.
export const FIVEM_DEFAULT_ENDPOINT = "https://main.imeroleplay.com:30120";

/**
 * How long the proxy waits on each FiveM endpoint before giving up. A snapshot
 * costs at most two of these back to back (the transport race, then the player
 * and info reads), so this has to stay under half Vercel's 10s Hobby function
 * limit — otherwise a server that simply ignores us produces a platform 504
 * instead of our own "offline" snapshot.
 */
export const FIVEM_FETCH_TIMEOUT_MS = 4000;

/** Client auto-refresh cadence when the toggle is on. */
export const FIVEM_REFRESH_INTERVAL_MS = 10_000;

/**
 * How long a computed snapshot is reused before `/api/fivem` fetches again.
 * Kept well under the client poll cadence so the monitor never feels stale, but
 * enough to collapse a burst of Super Admin tabs into one upstream round-trip.
 */
export const FIVEM_SNAPSHOT_CACHE_MS = 5_000;

/** How many player rows to render before the "Show more" control. */
export const FIVEM_PLAYERS_PER_PAGE = 20;

export const FIVEM_LABELS = {
  online: "Online",
  offline: "Offline",
} as const;

/**
 * Cfx.re's public server directory. Unlike the game server itself this is
 * reachable from any datacenter, so it is what the monitor falls back to when
 * the relay machine is asleep. Verified 2026-09-05: Vercel gets a 4s timeout on
 * both transports to the game server, so there is no direct route.
 *
 * The catch, and the reason this is a fallback and never the primary source: the
 * directory ANONYMISES the roster — every player comes back as `Anon0`,
 * `Anon1`, … with sequential fake pings. Status and counts are accurate.
 */
export const FIVEM_DIRECTORY_URL =
  "https://frontend.cfx-services.net/api/servers/single";

/** iMe RP's Cfx.re join code. Override with `FIVEM_JOIN_CODE`. */
export const FIVEM_DEFAULT_JOIN_CODE = "zrvmg4";

/**
 * How stale the directory's own `lastSeen` may be before we call the server
 * offline. Cfx.re keeps serving a record for a while after a server drops off
 * the list, so without this the monitor would cheerfully report a dead server
 * as online.
 */
export const FIVEM_DIRECTORY_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * How stale `fivem_uplink.updated_at` may be before the relay's published
 * endpoint is ignored and the app falls through to `FIVEM_SERVER_URL` / the
 * default / the directory. The relay re-publishes every ~60s and a standby takes
 * over within ~3min, so a row older than this means every publisher is down and
 * its URL (often a dead tunnel hostname) is worse than useless — trusting it
 * forever makes a dead relay indistinguishable from a dead game server.
 */
export const FIVEM_UPLINK_MAX_AGE_MS = 10 * 60 * 1000;
