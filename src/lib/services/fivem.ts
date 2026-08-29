import "server-only";

import {
  FIVEM_DEFAULT_ENDPOINT,
  FIVEM_FETCH_TIMEOUT_MS,
} from "@/lib/constants/fivem";
import {
  fivemDynamicSchema,
  fivemInfoSchema,
  fivemPlayersSchema,
  type FivemSnapshot,
} from "@/lib/validation/fivem";

/** Strip FiveM colour codes (`^1`, `^2`, …) from a hostname string. */
function stripColorCodes(value: string): string {
  return value.replace(/\^[0-9]/g, "").trim();
}

function resolveEndpoint(): string {
  const raw = process.env.FIVEM_SERVER_URL?.trim() || FIVEM_DEFAULT_ENDPOINT;
  return raw.replace(/\/+$/, "");
}

/** `http://host:30120` -> `host:30120` for the `fivem://connect/` deep link. */
function hostFromEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return endpoint.replace(/^https?:\/\//, "");
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FIVEM_FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

function offlineSnapshot(
  endpoint: string,
  error: string,
  latencyMs: number | null,
): FivemSnapshot {
  return {
    online: false,
    host: hostFromEndpoint(endpoint),
    connectUri: `fivem://connect/${hostFromEndpoint(endpoint)}`,
    hostname: null,
    projectName: null,
    players: [],
    playerCount: 0,
    maxClients: null,
    latencyMs,
    fetchedAt: new Date().toISOString(),
    error,
  };
}

/**
 * Fetches a live snapshot of the configured FiveM server. Never throws — a
 * failure (server down, endpoint privacy, timeout) resolves to an offline
 * snapshot carrying a human-readable `error`.
 */
export async function getServerSnapshot(): Promise<FivemSnapshot> {
  const endpoint = resolveEndpoint();
  const host = hostFromEndpoint(endpoint);
  const startedAt = Date.now();

  let dynamicRaw: unknown;
  let playersRaw: unknown;
  let infoRaw: unknown;
  try {
    [dynamicRaw, playersRaw, infoRaw] = await Promise.all([
      getJson(`${endpoint}/dynamic.json`),
      getJson(`${endpoint}/players.json`),
      getJson(`${endpoint}/info.json`).catch(() => ({})),
    ]);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "Server did not respond in time."
        : "Could not reach the server.";
    return offlineSnapshot(endpoint, message, latencyMs);
  }

  const latencyMs = Date.now() - startedAt;
  const dynamic = fivemDynamicSchema.safeParse(dynamicRaw);
  if (!dynamic.success) {
    return offlineSnapshot(
      endpoint,
      "Server returned an unexpected response.",
      latencyMs,
    );
  }

  const players = fivemPlayersSchema
    .parse(playersRaw)
    .map((p) => ({ id: p.id, name: stripColorCodes(p.name), ping: p.ping }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const info = fivemInfoSchema.safeParse(infoRaw);
  const projectName = info.success
    ? (info.data.vars?.sv_projectName?.trim() ?? null)
    : null;

  const hostname = dynamic.data.hostname
    ? stripColorCodes(dynamic.data.hostname)
    : null;
  const maxClients = dynamic.data.sv_maxclients ?? null;
  const playerCount = players.length || dynamic.data.clients;

  return {
    online: true,
    host,
    connectUri: `fivem://connect/${host}`,
    hostname,
    projectName,
    players,
    playerCount,
    maxClients: maxClients && maxClients > 0 ? maxClients : null,
    latencyMs,
    fetchedAt: new Date().toISOString(),
    error: null,
  };
}
