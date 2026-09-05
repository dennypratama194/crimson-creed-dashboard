import { z } from "zod";

/**
 * Defensive schemas for the FiveM HTTP endpoints. Community servers run many
 * framework versions and the payloads drift, so every field the UI does not
 * strictly need is optional and coerced.
 */

const looseInt = z.coerce.number().int().catch(0);

export const fivemDynamicSchema = z.object({
  clients: looseInt,
  sv_maxclients: looseInt.optional(),
  hostname: z.string().optional(),
  gametype: z.string().optional(),
  mapname: z.string().optional(),
});

export const fivemPlayerSchema = z.object({
  id: looseInt,
  name: z.string().catch("Unknown"),
  ping: z.coerce.number().int().catch(-1),
});

export const fivemPlayersSchema = z.array(fivemPlayerSchema).catch([]);

export const fivemInfoSchema = z.object({
  vars: z
    .object({
      sv_projectName: z.string().optional(),
      sv_projectDesc: z.string().optional(),
    })
    .partial()
    .optional(),
});

/**
 * Cfx.re's public directory payload. Only the handful of fields the fallback
 * needs are modelled; the endpoint returns a great deal more. `svMaxclients`
 * and `sv_maxclients` both appear in the wild, so accept either.
 */
export const fivemDirectorySchema = z.object({
  Data: z
    .object({
      hostname: z.string().optional(),
      clients: looseInt.optional(),
      svMaxclients: looseInt.optional(),
      sv_maxclients: looseInt.optional(),
      lastSeen: z.string().optional(),
      vars: z
        .object({ sv_projectName: z.string().optional() })
        .partial()
        .optional(),
    })
    .optional(),
});

/**
 * Where a snapshot's numbers came from. `server` is the game server's own
 * endpoints, read directly or through the relay, and carries the real roster.
 * `directory` is Cfx.re's public listing — always reachable, but it anonymises
 * players, so the roster is withheld rather than shown as `Anon0`, `Anon1`, …
 */
export type FivemSource = "server" | "directory";

/** Normalised snapshot returned by the proxy route and consumed by the UI. */
export type FivemPlayer = {
  id: number;
  name: string;
  ping: number;
};

export type FivemSnapshot = {
  online: boolean;
  host: string;
  connectUri: string;
  hostname: string | null;
  projectName: string | null;
  players: FivemPlayer[];
  playerCount: number;
  maxClients: number | null;
  latencyMs: number | null;
  fetchedAt: string;
  error: string | null;
  source: FivemSource;
};
