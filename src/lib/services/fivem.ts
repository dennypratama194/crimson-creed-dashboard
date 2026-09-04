import "server-only";

import { Agent, fetch as undiciFetch } from "undici";

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

/**
 * The configured endpoint first, then the same host:port with the scheme
 * flipped. The two transports fail on opposite networks and we cannot tell
 * which caller we are: from a datacenter (Vercel) the raw-IP http port is
 * blackholed but the https proxy answers; from some ISP/office networks a
 * middlebox resets Node's TLS handshake to the game port (a browser or curl
 * gets through, undici does not) while plain http is fine. Trying both, and
 * remembering the winner, covers every case.
 */
function candidateEndpoints(): [string, ...string[]] {
  const primary = resolveEndpoint();
  let flipped: string | null = null;
  if (primary.startsWith("https://")) {
    flipped = `http://${primary.slice("https://".length)}`;
  } else if (primary.startsWith("http://")) {
    flipped = `https://${primary.slice("http://".length)}`;
  }
  return flipped ? [primary, flipped] : [primary];
}

/** Remember which transport last worked so the healthy path is one round-trip. */
let cachedBase: { url: string; at: number } | undefined;
const BASE_CACHE_MS = 5 * 60_000;

/**
 * The server's https endpoint answers behind a proxy but ships an EXPIRED
 * certificate, so verification is disabled deliberately: this is a read-only
 * player-count widget and nothing keys off the data. The dispatcher is scoped
 * to these calls only; it is not the global default.
 */
const fivemDispatcher = new Agent({
  connect: { rejectUnauthorized: false, timeout: FIVEM_FETCH_TIMEOUT_MS },
});

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
  const res = await undiciFetch(url, {
    dispatcher: fivemDispatcher,
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
  const candidates = candidateEndpoints();
  const host = hostFromEndpoint(candidates[0]);
  const startedAt = Date.now();

  // Try the remembered-good transport first, then the rest, until one answers
  // `dynamic.json`. That response is kept — no need to re-fetch it below.
  const cached =
    cachedBase && Date.now() - cachedBase.at < BASE_CACHE_MS
      ? cachedBase.url
      : null;
  const ordered =
    cached && candidates.includes(cached)
      ? [cached, ...candidates.filter((c) => c !== cached)]
      : candidates;

  let endpoint: string | null = null;
  let dynamicRaw: unknown;
  let lastErr: unknown;
  for (const candidate of ordered) {
    try {
      dynamicRaw = await getJson(`${candidate}/dynamic.json`);
      endpoint = candidate;
      cachedBase = { url: candidate, at: Date.now() };
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (endpoint === null) {
    cachedBase = undefined;
    const latencyMs = Date.now() - startedAt;
    console.error("[fivem] snapshot fetch failed", {
      candidates: ordered,
      latencyMs,
      timeoutMs: FIVEM_FETCH_TIMEOUT_MS,
      ...describeError(lastErr),
    });
    const message =
      lastErr instanceof Error && lastErr.name === "TimeoutError"
        ? "The server did not respond in time."
        : "Could not reach the server.";
    return offlineSnapshot(host, message, latencyMs);
  }

  let playersRaw: unknown;
  let infoRaw: unknown;
  try {
    [playersRaw, infoRaw] = await Promise.all([
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
  candidates: string[];
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
 * Diagnostic: hit `dynamic.json` on every candidate transport independently and
 * report exactly what happened (status, timing, failure code). Unlike
 * `getServerSnapshot` this does not fail fast, so a scheme that a middlebox
 * resets is visible next to the one that works via `/api/fivem?debug=1`.
 */
export async function probeServer(): Promise<FivemProbe> {
  const candidates = candidateEndpoints();
  const targets = candidates.map((base) => ({
    name: base.startsWith("https://") ? "https" : "http",
    url: `${base}/dynamic.json`,
  }));

  const results = await Promise.all(
    targets.map(async ({ name, url }) => {
      const startedAt = Date.now();
      try {
        const res = await undiciFetch(url, {
          dispatcher: fivemDispatcher,
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
    endpoint: candidates[0],
    candidates,
    timeoutMs: FIVEM_FETCH_TIMEOUT_MS,
    startedAt: new Date().toISOString(),
    results,
  };
}
