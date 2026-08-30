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

/**
 * Flatten an error (and undici's nested `cause` chain) into a loggable object.
 * `causeCode` is the useful bit — `ETIMEDOUT` / `UND_ERR_CONNECT_TIMEOUT` means
 * the host blackholed us (IP block or server down); `ECONNREFUSED` means we
 * reached it but the port is closed.
 */
function describeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { value: String(err) };
  const out: Record<string, unknown> = { name: err.name, message: err.message };
  const cause = err.cause;
  if (cause instanceof Error) {
    out.causeName = cause.name;
    out.causeMessage = cause.message;
    if ("code" in cause) out.causeCode = (cause as { code?: unknown }).code;
    if (cause instanceof AggregateError) {
      out.causeErrors = cause.errors.map((e) =>
        e instanceof Error
          ? { message: e.message, code: (e as { code?: unknown }).code }
          : String(e),
      );
    }
  } else if (cause !== undefined) {
    out.cause = String(cause);
  }
  return out;
}

function resolveEndpoint(): string {
  const raw = process.env.FIVEM_SERVER_URL?.trim() || FIVEM_DEFAULT_ENDPOINT;
  return raw.replace(/\/+$/, "");
}

/** `http://host:30120` -> `host:30120` for display + the `fivem://connect/` link. */
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
  host: string,
  error: string,
  latencyMs: number | null,
): FivemSnapshot {
  return {
    online: false,
    host,
    connectUri: `fivem://connect/${host}`,
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
 * Live snapshot of the configured FiveM server, read from its own public HTTP
 * endpoints. Never throws — a failure (server down, timeout, unexpected
 * payload) resolves to an offline snapshot carrying a human-readable `error`.
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
    console.error("[fivem] snapshot fetch failed", {
      endpoint,
      latencyMs,
      timeoutMs: FIVEM_FETCH_TIMEOUT_MS,
      ...describeError(err),
    });
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "The server did not respond in time."
        : "Could not reach the server.";
    return offlineSnapshot(host, message, latencyMs);
  }

  const latencyMs = Date.now() - startedAt;
  const dynamic = fivemDynamicSchema.safeParse(dynamicRaw);
  if (!dynamic.success) {
    return offlineSnapshot(
      host,
      "The server returned an unexpected response.",
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

  return {
    online: true,
    host,
    connectUri: `fivem://connect/${host}`,
    hostname,
    projectName,
    players,
    playerCount: players.length || dynamic.data.clients,
    maxClients: maxClients && maxClients > 0 ? maxClients : null,
    latencyMs,
    fetchedAt: new Date().toISOString(),
    error: null,
  };
}

// ── diagnostics (/api/fivem?debug=1) ──────────────────────────────────────

export type FivemProbe = {
  endpoint: string;
  timeoutMs: number;
  startedAt: string;
  results: {
    name: string;
    url: string;
    ok: boolean;
    status: number | null;
    ms: number;
    bytes: number | null;
    error: Record<string, unknown> | null;
  }[];
};

/**
 * Diagnostic: hit each FiveM endpoint independently and report exactly what
 * happened (status, timing, failure code). Unlike `getServerSnapshot` this does
 * not fail fast, so one blocked endpoint is visible next to the others via
 * `/api/fivem?debug=1`.
 */
export async function probeServer(): Promise<FivemProbe> {
  const endpoint = resolveEndpoint();
  const targets = [
    { name: "dynamic", url: `${endpoint}/dynamic.json` },
    { name: "players", url: `${endpoint}/players.json` },
    { name: "info", url: `${endpoint}/info.json` },
  ];

  const results = await Promise.all(
    targets.map(async ({ name, url }) => {
      const startedAt = Date.now();
      try {
        const res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(FIVEM_FETCH_TIMEOUT_MS),
          headers: { accept: "application/json" },
        });
        const body = await res.text();
        return {
          name,
          url,
          ok: res.ok,
          status: res.status,
          ms: Date.now() - startedAt,
          bytes: body.length,
          error: res.ok
            ? null
            : { message: `HTTP ${res.status}`, body: body.slice(0, 200) },
        };
      } catch (err) {
        return {
          name,
          url,
          ok: false,
          status: null,
          ms: Date.now() - startedAt,
          bytes: null,
          error: describeError(err),
        };
      }
    }),
  );

  return {
    endpoint,
    timeoutMs: FIVEM_FETCH_TIMEOUT_MS,
    startedAt: new Date().toISOString(),
    results,
  };
}
