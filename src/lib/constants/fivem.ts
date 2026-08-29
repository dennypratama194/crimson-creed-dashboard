/**
 * FiveM live-server monitor config. The server endpoint is read from
 * `FIVEM_SERVER_URL` (server-only env); this is the fallback used in local dev
 * and matches the server in the PRD reference screenshot.
 *
 * FiveM exposes unauthenticated HTTP on the game port:
 *   GET {endpoint}/dynamic.json  -> { clients, sv_maxclients, hostname, ... }
 *   GET {endpoint}/players.json  -> [{ id, name, ping, identifiers }]
 *   GET {endpoint}/info.json     -> { vars: { sv_projectName, ... }, ... }
 */

export const FIVEM_DEFAULT_ENDPOINT = "http://main.imeroleplay.com:30120";

/** How long the server proxy waits on each FiveM endpoint before giving up. */
export const FIVEM_FETCH_TIMEOUT_MS = 6000;

/** Client auto-refresh cadence when the toggle is on. */
export const FIVEM_REFRESH_INTERVAL_MS = 10_000;

/** How many player rows to render before the "Show more" control. */
export const FIVEM_PLAYERS_PER_PAGE = 20;

export const FIVEM_LABELS = {
  online: "Online",
  offline: "Offline",
} as const;
