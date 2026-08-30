import "server-only";

import {
  FIVEM_DEFAULT_JOIN_CODE,
  FIVEM_FETCH_TIMEOUT_MS,
  FIVEM_MASTER_API_BASE,
} from "@/lib/constants/fivem";
import {
  fivemMasterResponseSchema,
  type FivemSnapshot,
} from "@/lib/validation/fivem";

/** Strip FiveM colour codes (`^1`, `^2`, …) from a hostname string. */
function stripColorCodes(value: string): string {
  return value.replace(/\^[0-9]/g, "").trim();
}

/**
 * Flatten an error (and undici's nested `cause` chain) into a loggable object.
 * `causeCode` is the useful bit — `ETIMEDOUT` / `UND_ERR_CONNECT_TIMEOUT` means
 * the master list blackholed us; `ECONNREFUSED` means we reached it but the
 * port is closed.
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

function resolveJoinCode(): string {
  return process.env.FIVEM_JOIN_CODE?.trim() || FIVEM_DEFAULT_JOIN_CODE;
}

function masterUrl(joinCode: string): string {
  return `${FIVEM_MASTER_API_BASE}/${encodeURIComponent(joinCode)}`;
}

/** Cfx.re deep link + short display host for a join code. */
function connectTarget(joinCode: string): { host: string; connectUri: string } {
  return {
    host: `cfx.re/join/${joinCode}`,
    connectUri: `fivem://connect/cfx.re/join/${joinCode}`,
  };
}

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

export type FivemProbe = {
  joinCode: string;
  url: string;
  timeoutMs: number;
  startedAt: string;
  result: {
    ok: boolean;
    status: number | null;
    ms: number;
    bytes: number | null;
    error: Record<string, unknown> | null;
  };
};

/**
 * Diagnostic: hit the master list once and report exactly what happened
 * (status, timing, failure code) without the schema/normalisation layer, so a
 * transport failure is visible in the browser via `/api/fivem?debug=1`.
 */
export async function probeServer(): Promise<FivemProbe> {
  const joinCode = resolveJoinCode();
  const url = masterUrl(joinCode);
  const startedAt = Date.now();

  let result: FivemProbe["result"];
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(FIVEM_FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    const body = await res.text();
    result = {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - startedAt,
      bytes: body.length,
      error: res.ok
        ? null
        : { message: `HTTP ${res.status}`, body: body.slice(0, 200) },
    };
  } catch (err) {
    result = {
      ok: false,
      status: null,
      ms: Date.now() - startedAt,
      bytes: null,
      error: describeError(err),
    };
  }

  return {
    joinCode,
    url,
    timeoutMs: FIVEM_FETCH_TIMEOUT_MS,
    startedAt: new Date().toISOString(),
    result,
  };
}

function offlineSnapshot(
  joinCode: string,
  error: string,
  latencyMs: number | null,
): FivemSnapshot {
  const { host, connectUri } = connectTarget(joinCode);
  return {
    online: false,
    host,
    connectUri,
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
 * Fetches a live snapshot of the configured FiveM server from the Cfx.re master
 * list. Never throws — a failure (unknown join code, master-list outage,
 * timeout) resolves to an offline snapshot carrying a human-readable `error`.
 */
export async function getServerSnapshot(): Promise<FivemSnapshot> {
  const joinCode = resolveJoinCode();
  const { host, connectUri } = connectTarget(joinCode);
  const startedAt = Date.now();

  let raw: unknown;
  try {
    raw = await fetchMaster(joinCode);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    console.error("[fivem] snapshot fetch failed", {
      joinCode,
      latencyMs,
      timeoutMs: FIVEM_FETCH_TIMEOUT_MS,
      ...describeError(err),
    });
    if (err instanceof UnknownJoinCodeError) {
      return offlineSnapshot(
        joinCode,
        `Server not listed on the Cfx.re master list for join code “${joinCode}”. The code may have changed.`,
        latencyMs,
      );
    }
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "The Cfx.re master list did not respond in time."
        : "Could not reach the Cfx.re master list.";
    return offlineSnapshot(joinCode, message, latencyMs);
  }

  const latencyMs = Date.now() - startedAt;
  const parsed = fivemMasterResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return offlineSnapshot(
      joinCode,
      "The Cfx.re master list returned an unexpected response.",
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
  const playerCount = players.length || data.clients;

  return {
    online: true,
    host,
    connectUri,
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
