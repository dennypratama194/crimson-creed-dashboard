import "server-only";

import { Agent, fetch as undiciFetch } from "undici";

import {
  FIVEM_DEFAULT_ENDPOINT,
  FIVEM_FETCH_TIMEOUT_MS,
} from "@/lib/constants/fivem";
import { getFivemUplink } from "@/lib/db/fivem";
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

/** Which configuration source won, for logging and for the offline message. */
type EndpointSource = "uplink" | "env" | "default";

type ResolvedEndpoint = {
  base: string;
  source: EndpointSource;
  /** When the relay last published (ISO). Only set for `source: "uplink"`. */
  publishedAt: string | null;
};

/**
 * The relay's own published address wins over `FIVEM_SERVER_URL`.
 *
 * That order is deliberate. The relay sits behind a tunnel whose hostname
 * changes on every restart, so an env var pinned at deploy time goes stale the
 * first time the relay machine reboots — and fixing it meant editing the
 * hosting dashboard and redeploying, with the monitor stuck on "Offline" until
 * someone noticed. Letting the database value take precedence means a long-dead
 * `FIVEM_SERVER_URL` is simply ignored instead of having to be cleared. The env
 * var still applies when no relay has ever published.
 */
async function resolveEndpoint(): Promise<ResolvedEndpoint> {
  const strip = (value: string) => value.replace(/\/+$/, "");

  const uplink = await getFivemUplink();
  if (uplink) {
    return {
      base: strip(uplink.endpoint),
      source: "uplink",
      publishedAt: uplink.updatedAt,
    };
  }

  const fromEnv = process.env.FIVEM_SERVER_URL?.trim();
  if (fromEnv) {
    return { base: strip(fromEnv), source: "env", publishedAt: null };
  }

  return { base: FIVEM_DEFAULT_ENDPOINT, source: "default", publishedAt: null };
}

/**
 * The resolved endpoint first, then the same host:port with the scheme flipped.
 * The two transports fail on opposite networks and we cannot tell which caller
 * we are: from a datacenter (Vercel) the raw-IP http port is blackholed but the
 * https proxy answers; from some ISP/office networks a middlebox resets Node's
 * TLS handshake to the game port (a browser or curl gets through, undici does
 * not) while plain http is fine. Trying both covers every case.
 */
async function candidateEndpoints(): Promise<
  ResolvedEndpoint & { candidates: [string, ...string[]] }
> {
  const resolved = await resolveEndpoint();
  const primary = resolved.base;
  let flipped: string | null = null;
  if (primary.startsWith("https://")) {
    flipped = `http://${primary.slice("https://".length)}`;
  } else if (primary.startsWith("http://")) {
    flipped = `https://${primary.slice("http://".length)}`;
  }
  return {
    ...resolved,
    candidates: flipped ? [primary, flipped] : [primary],
  };
}

/**
 * The server's https endpoint ships a SELF-SIGNED certificate, so verification
 * is disabled deliberately: this is a read-only player-count widget and nothing
 * keys off the data. The dispatcher is scoped to these calls only; it is not the
 * global default.
 *
 * `family: 4` is not cosmetic. The host publishes an AAAA record, and serverless
 * runtimes (Vercel/Lambda) have no IPv6 egress — picking the v6 address there
 * fails with no useful error. Pin to the A record so every environment takes the
 * same route.
 */
const fivemDispatcher = new Agent({
  connect: {
    rejectUnauthorized: false,
    timeout: FIVEM_FETCH_TIMEOUT_MS,
    family: 4,
  },
});

/**
 * The address players join, shown in the header and used for `fivem://connect/`.
 * Defaults to whatever we read from, which is correct when that is the game
 * server itself. Reading through a relay says nothing about where players
 * connect — a tunnel hostname is not joinable — so that case falls back to the
 * game server we know about. `FIVEM_PUBLIC_HOST` overrides both.
 */
function resolvePublicHost(
  readEndpoint: string,
  source: EndpointSource,
): string {
  const explicit = process.env.FIVEM_PUBLIC_HOST?.trim();
  if (explicit) return explicit;
  if (source === "uplink") return hostFromEndpoint(FIVEM_DEFAULT_ENDPOINT);
  return hostFromEndpoint(readEndpoint);
}

/** `http://host:30120` -> `host:30120`. */
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
 * A dead relay and a dead game server are different problems with different
 * fixes, and the monitor is the only place either becomes visible. Name the one
 * that actually failed so nobody goes hunting the game server when the machine
 * at home is simply asleep.
 */
function offlineMessage(source: EndpointSource, err: unknown): string {
  if (source === "uplink") return "Could not reach the relay machine.";
  return err instanceof Error && err.name === "TimeoutError"
    ? "The server did not respond in time."
    : "Could not reach the server.";
}

/**
 * Live snapshot of the configured FiveM server, read from its own public HTTP
 * endpoints. Never throws — a failure (server down, timeout, unexpected
 * payload) resolves to an offline snapshot carrying a human-readable `error`.
 */
export async function getServerSnapshot(): Promise<FivemSnapshot> {
  const { candidates, source, publishedAt } = await candidateEndpoints();
  const host = resolvePublicHost(candidates[0], source);
  const startedAt = Date.now();

  // Race the transports rather than trying them in turn: whichever answers
  // `dynamic.json` first wins and its response is kept. Sequential attempts
  // would cost the sum of both timeouts on a server that ignores us, which
  // overruns the platform's function limit before we can return "offline".
  let endpoint: string | null = null;
  let dynamicRaw: unknown;
  let lastErr: unknown;
  try {
    const won = await Promise.any(
      candidates.map(async (base) => ({
        base,
        raw: await getJson(`${base}/dynamic.json`),
      })),
    );
    endpoint = won.base;
    dynamicRaw = won.raw;
  } catch (err) {
    // AggregateError — every transport failed. Report the first cause.
    lastErr = err instanceof AggregateError ? (err.errors[0] ?? err) : err;
  }

  if (endpoint === null) {
    const latencyMs = Date.now() - startedAt;
    console.error("[fivem] snapshot fetch failed", {
      candidates,
      source,
      publishedAt,
      latencyMs,
      timeoutMs: FIVEM_FETCH_TIMEOUT_MS,
      ...describeError(lastErr),
    });
    return offlineSnapshot(host, offlineMessage(source, lastErr), latencyMs);
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
      source,
      publishedAt,
      latencyMs,
      timeoutMs: FIVEM_FETCH_TIMEOUT_MS,
      ...describeError(err),
    });
    return offlineSnapshot(host, offlineMessage(source, err), latencyMs);
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
  source: EndpointSource;
  publishedAt: string | null;
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
 * `source` and `publishedAt` say where the address came from, which is the
 * first thing to check when the monitor reads a stale relay URL.
 */
export async function probeServer(): Promise<FivemProbe> {
  const { candidates, source, publishedAt } = await candidateEndpoints();
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
    source,
    publishedAt,
    timeoutMs: FIVEM_FETCH_TIMEOUT_MS,
    startedAt: new Date().toISOString(),
    results,
  };
}
