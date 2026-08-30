import "server-only";

import {
  FIVEM_DEFAULT_JOIN_CODE,
  FIVEM_DIRECT_ENDPOINT,
  FIVEM_DIRECT_TIMEOUT_MS,
  FIVEM_FETCH_TIMEOUT_MS,
  FIVEM_MASTER_API_BASE,
} from "@/lib/constants/fivem";
import {
  fivemDynamicSchema,
  fivemInfoSchema,
  fivemMasterResponseSchema,
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

function resolveDirectEndpoint(): string {
  const raw = process.env.FIVEM_SERVER_URL?.trim() || FIVEM_DIRECT_ENDPOINT;
  return raw.replace(/\/+$/, "");
}

function resolveJoinCode(): string {
  return process.env.FIVEM_JOIN_CODE?.trim() || FIVEM_DEFAULT_JOIN_CODE;
}

function masterUrl(joinCode: string): string {
  return `${FIVEM_MASTER_API_BASE}/${encodeURIComponent(joinCode)}`;
}

type ConnectTarget = { host: string; connectUri: string };

/**
 * Display host + connect deep link. Always the Cfx.re join code — it works for
 * players regardless of which data path produced the snapshot.
 */
function connectTarget(joinCode: string): ConnectTarget {
  return {
    host: `cfx.re/join/${joinCode}`,
    connectUri: `fivem://connect/cfx.re/join/${joinCode}`,
  };
}

async function getJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

// ── direct path (real player names) ───────────────────────────────────────

/**
 * Hits the server's own HTTP endpoints. Returns `null` on any failure (timeout,
 * blackholed port, bad payload) so the caller falls back to the master list.
 */
async function directSnapshot(
  target: ConnectTarget,
): Promise<FivemSnapshot | null> {
  const endpoint = resolveDirectEndpoint();
  const startedAt = Date.now();

  let dynamicRaw: unknown;
  let playersRaw: unknown;
  let infoRaw: unknown;
  try {
    [dynamicRaw, playersRaw, infoRaw] = await Promise.all([
      getJson(`${endpoint}/dynamic.json`, FIVEM_DIRECT_TIMEOUT_MS),
      getJson(`${endpoint}/players.json`, FIVEM_DIRECT_TIMEOUT_MS),
      getJson(`${endpoint}/info.json`, FIVEM_DIRECT_TIMEOUT_MS).catch(
        () => ({}),
      ),
    ]);
  } catch (err) {
    console.error("[fivem] direct fetch failed, falling back to master list", {
      endpoint,
      ms: Date.now() - startedAt,
      ...describeError(err),
    });
    return null;
  }

  const dynamic = fivemDynamicSchema.safeParse(dynamicRaw);
  if (!dynamic.success) return null;

  const latencyMs = Date.now() - startedAt;
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
    host: target.host,
    connectUri: target.connectUri,
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

// ── master-list path (aggregate, anonymised names) ───────────────────────

/** Raised when the master list has no server for our join code (HTTP 404). */
class UnknownJoinCodeError extends Error {
  constructor(joinCode: string) {
    super(`Cfx.re master list has no server for join code "${joinCode}".`);
    this.name = "UnknownJoinCodeError";
  }
}

async function fetchMaster(joinCode: string): Promise<unknown> {
  const url = masterUrl(joinCode);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FIVEM_FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (res.status === 404) throw new UnknownJoinCodeError(joinCode);
    if (!res.ok) throw new Error(`${url} responded ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[fivem] master list fetch failed", {
      url,
      ms: Date.now() - startedAt,
      ...describeError(err),
    });
    throw err;
  }
}

function offlineSnapshot(
  target: ConnectTarget,
  error: string,
  latencyMs: number | null,
): FivemSnapshot {
  return {
    online: false,
    host: target.host,
    connectUri: target.connectUri,
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

async function masterSnapshot(
  joinCode: string,
  target: ConnectTarget,
): Promise<FivemSnapshot> {
  const startedAt = Date.now();

  let raw: unknown;
  try {
    raw = await fetchMaster(joinCode);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    if (err instanceof UnknownJoinCodeError) {
      return offlineSnapshot(
        target,
        `Server not listed on the Cfx.re master list for join code “${joinCode}”. The code may have changed.`,
        latencyMs,
      );
    }
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "The server did not respond in time."
        : "Could not reach the server.";
    return offlineSnapshot(target, message, latencyMs);
  }

  const latencyMs = Date.now() - startedAt;
  const parsed = fivemMasterResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return offlineSnapshot(
      target,
      "The server returned an unexpected response.",
      latencyMs,
    );
  }

  const data = parsed.data.Data;
  const players = data.players
    .map((p) => ({ id: p.id, name: stripColorCodes(p.name), ping: p.ping }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const hostname = data.hostname ? stripColorCodes(data.hostname) : null;
  const projectName = data.vars?.sv_projectName?.trim() || null;
  const maxClients = data.sv_maxclients ?? null;

  return {
    online: true,
    host: target.host,
    connectUri: target.connectUri,
    hostname,
    projectName,
    players,
    playerCount: players.length || data.clients,
    maxClients: maxClients && maxClients > 0 ? maxClients : null,
    latencyMs,
    fetchedAt: new Date().toISOString(),
    error: null,
  };
}

/**
 * Live snapshot of the configured FiveM server. Tries the server's own HTTP
 * endpoints first (real player names); on timeout or failure — e.g. from a
 * datacenter IP the server blackholes — falls back to the Cfx.re master list
 * (aggregate, anonymised names). Never throws: a total failure resolves to an
 * offline snapshot carrying a human-readable `error`.
 */
export async function getServerSnapshot(): Promise<FivemSnapshot> {
  const joinCode = resolveJoinCode();
  const target = connectTarget(joinCode);

  const direct = await directSnapshot(target);
  if (direct) return direct;

  return masterSnapshot(joinCode, target);
}

// ── diagnostics (/api/fivem?debug=1) ─────────────────────────────────────

type ProbeResult = {
  ok: boolean;
  status: number | null;
  ms: number;
  bytes: number | null;
  error: Record<string, unknown> | null;
};

export type FivemProbe = {
  directEndpoint: string;
  joinCode: string;
  masterUrl: string;
  startedAt: string;
  direct: ProbeResult;
  master: ProbeResult;
};

async function probe(url: string, timeoutMs: number): Promise<ProbeResult> {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    const body = await res.text();
    return {
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
      ok: false,
      status: null,
      ms: Date.now() - startedAt,
      bytes: null,
      error: describeError(err),
    };
  }
}

/**
 * Diagnostic: probe both data paths independently and report exactly what
 * happened (status, timing, failure code), so which path is serving — and why
 * the other isn't — is visible in the browser via `/api/fivem?debug=1`.
 */
export async function probeServer(): Promise<FivemProbe> {
  const endpoint = resolveDirectEndpoint();
  const joinCode = resolveJoinCode();
  const master = masterUrl(joinCode);

  const [directResult, masterResult] = await Promise.all([
    probe(`${endpoint}/players.json`, FIVEM_DIRECT_TIMEOUT_MS),
    probe(master, FIVEM_FETCH_TIMEOUT_MS),
  ]);

  return {
    directEndpoint: endpoint,
    joinCode,
    masterUrl: master,
    startedAt: new Date().toISOString(),
    direct: directResult,
    master: masterResult,
  };
}
