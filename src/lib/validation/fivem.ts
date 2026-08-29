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
};
