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
 * How long the server proxy waits on each FiveM endpoint before giving up. Kept
 * under Vercel's 10s Hobby function limit so a stall resolves to our own
 * "offline" snapshot rather than a platform 504.
 */
export const FIVEM_FETCH_TIMEOUT_MS = 8000;

/** Client auto-refresh cadence when the toggle is on. */
export const FIVEM_REFRESH_INTERVAL_MS = 10_000;

/** How many player rows to render before the "Show more" control. */
export const FIVEM_PLAYERS_PER_PAGE = 20;

export const FIVEM_LABELS = {
  online: "Online",
  offline: "Offline",
} as const;
