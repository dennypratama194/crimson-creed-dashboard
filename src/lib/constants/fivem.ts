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
 * costs at most two of these back to back (the transport race — plus
 * `FIVEM_TRANSPORT_HEAD_START_MS` when a remembered transport hangs — then the
 * player and info reads), so this has to stay under half Vercel's 10s Hobby function
 * limit — otherwise a server that simply ignores us produces a platform 504
 * instead of our own "offline" snapshot.
 */
export const FIVEM_FETCH_TIMEOUT_MS = 4000;

/**
 * Client auto-refresh cadence while the game server itself answers (real
 * roster, live counts). See `fivemRefreshInterval` for how the others apply.
 */
export const FIVEM_REFRESH_INTERVAL_MS = 30_000;

/**
 * Cadence while the snapshot comes from the public directory, even when that
 * says the server is online. The directory's own numbers lag by minutes, so
 * polling it every 30s buys nothing but invocations.
 */
export const FIVEM_DIRECTORY_REFRESH_INTERVAL_MS = 2 * 60_000;

/** Retry less aggressively when the upstream server is unreachable. */
export const FIVEM_OFFLINE_REFRESH_INTERVAL_MS = 60_000;

/**
 * Longest the client waits between attempts while `/api/fivem` itself keeps
 * failing (the offline cadence doubles per consecutive failure up to this).
 */
export const FIVEM_ERROR_REFRESH_MAX_MS = 10 * 60_000;

/**
 * How long a computed snapshot is reused before `/api/fivem` fetches again —
 * half the matching client cadence, so a single tab always gets a fresh read
 * while a burst of Super Admin tabs collapses into one upstream round trip.
 * Warm-instance only: see `getServerSnapshot`.
 */
export const FIVEM_SNAPSHOT_CACHE_MS = 15_000;
/** A directory-sourced snapshot: the source is minutes stale anyway. */
export const FIVEM_DIRECTORY_SNAPSHOT_CACHE_MS = 60_000;
/** An offline snapshot: the upstream backoff decides when to try again. */
export const FIVEM_OFFLINE_SNAPSHOT_CACHE_MS = 30_000;

/**
 * `info.json` (project name, server vars) changes when the server is
 * reconfigured, not between polls, so it is cached per endpoint far longer
 * than the live roster. A failed read is retried sooner.
 */
export const FIVEM_INFO_CACHE_MS = 30 * 60_000;
export const FIVEM_INFO_RETRY_MS = 5 * 60_000;

/**
 * How long the transport (http vs https) that last answered is tried alone
 * first. Racing both on every snapshot doubles the upstream requests for
 * nothing once we know which one this network lets through.
 */
export const FIVEM_TRANSPORT_MEMORY_MS = 10 * 60_000;

/**
 * Head start the remembered transport gets before the other is raced anyway.
 * A remembered transport that errors hands over immediately; one that hangs
 * costs at most this much extra before the fallback is in flight.
 */
export const FIVEM_TRANSPORT_HEAD_START_MS = 500;

/**
 * Backoff before an unreachable upstream (the game server / relay, or the
 * directory) is tried again: doubles per consecutive failure, capped.
 */
export const FIVEM_UPSTREAM_BACKOFF_BASE_MS = 30_000;
export const FIVEM_UPSTREAM_BACKOFF_MAX_MS = 5 * 60_000;

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
