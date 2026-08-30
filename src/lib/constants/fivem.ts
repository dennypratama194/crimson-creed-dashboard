/**
 * FiveM live-server monitor config.
 *
 * We do NOT hit the game server's own HTTP port (`:30120`) any more: the host
 * firewall blackholes datacenter IPs on that port, so every request from Vercel
 * times out even while the server is full. Instead we query Cfx.re's public
 * master list, which is trusted infra the server opted into by listing itself:
 *
 *   GET {FIVEM_MASTER_API_BASE}/{joinCode}
 *     -> { Data: { hostname, clients, sv_maxclients, players:[{id,name,ping}],
 *                  vars:{ sv_projectName, ... } } }
 *
 * The join code is read from `FIVEM_JOIN_CODE` (server-only env) and defaults to
 * the reference server below. If IME Roleplay ever rotates its code this breaks,
 * so a 404 from the master list surfaces as a visible error, never a silent
 * "offline".
 */

/** Cfx.re master-list single-server endpoint. Append `/{joinCode}`. */
export const FIVEM_MASTER_API_BASE =
  "https://frontend.cfx-services.net/api/servers/single";

/** Fallback join code (Cfx.re "connect" code) used when the env var is unset. */
export const FIVEM_DEFAULT_JOIN_CODE = "zrvmg4";

/** How long the server proxy waits on the master list before giving up. */
export const FIVEM_FETCH_TIMEOUT_MS = 8000;

/** Client auto-refresh cadence when the toggle is on. */
export const FIVEM_REFRESH_INTERVAL_MS = 10_000;

/** How many player rows to render before the "Show more" control. */
export const FIVEM_PLAYERS_PER_PAGE = 20;

export const FIVEM_LABELS = {
  online: "Online",
  offline: "Offline",
} as const;
