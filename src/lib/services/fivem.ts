import "server-only";

import { Agent, fetch as undiciFetch } from "undici";

import {
  FIVEM_DEFAULT_ENDPOINT,
  FIVEM_DEFAULT_JOIN_CODE,
  FIVEM_DIRECTORY_MAX_AGE_MS,
  FIVEM_DIRECTORY_URL,
  FIVEM_FETCH_TIMEOUT_MS,
  FIVEM_SNAPSHOT_CACHE_MS,
  FIVEM_UPLINK_MAX_AGE_MS,
} from "@/lib/constants/fivem";
import { brand } from "@/lib/brand";
import { getFivemUplink } from "@/lib/db/fivem";
import {
  fivemDirectorySchema,
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
 * var still applies when no relay has ever published — or when the last relay to
 * publish went quiet long enough ago (`FIVEM_UPLINK_MAX_AGE_MS`) that its
 * address, usually a since-recycled tunnel hostname, is dead weight. Without that
 * cutoff a stale row shadows a working `FIVEM_SERVER_URL` forever.
 */
async function resolveEndpoint(): Promise<ResolvedEndpoint> {
  const strip = (value: string) => value.replace(/\/+$/, "");

  const uplink = await getFivemUplink();
  if (uplink) {
    const age = Date.now() - new Date(uplink.updatedAt).getTime();
    if (Number.isFinite(age) && age <= FIVEM_UPLINK_MAX_AGE_MS) {
      return {
        base: strip(uplink.endpoint),
        source: "uplink",
        publishedAt: uplink.updatedAt,
      };
    }
    console.warn("[fivem] ignoring stale uplink row", {
      publishedAt: uplink.updatedAt,
      ageMs: Number.isFinite(age) ? age : null,
      maxAgeMs: FIVEM_UPLINK_MAX_AGE_MS,
    });
  }

  const fromEnv = process.env.FIVEM_SERVER_URL?.trim();
  if (fromEnv) {
    return { base: strip(fromEnv), source: "env", publishedAt: null };
  }

  return {
    base: brand.isCrimson ? FIVEM_DEFAULT_ENDPOINT : "",
    source: "default",
    publishedAt: null,
  };
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
  if (source === "uplink") {
    return hostFromEndpoint(
      process.env.FIVEM_SERVER_URL?.trim() ||
        (brand.isCrimson ? FIVEM_DEFAULT_ENDPOINT : ""),
    );
  }
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

/**
 * Carries the upstream HTTP status so callers can tell apart a relay that
 * answered ("the game server did not respond to me", 502) from one that never
 * answered at all. Those look identical without it, and they have completely
 * different fixes.
 */
class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`${url} responded ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

async function getJson(url: string): Promise<unknown> {
  const res = await undiciFetch(url, {
    dispatcher: fivemDispatcher,
    signal: AbortSignal.timeout(FIVEM_FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new HttpStatusError(res.status, url);
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
    source: "server",
  };
}

/**
 * Cfx.re is an ordinary public CDN, so its certificate is verified normally.
 * Only the game server needs the self-signed exemption above.
 */
const directoryDispatcher = new Agent({
  connect: { timeout: FIVEM_FETCH_TIMEOUT_MS, family: 4 },
});

/**
 * Fallback: read status and player count from Cfx.re's public directory.
 *
 * The game server black-holes datacenter traffic, so when the relay machine is
 * off there is no route to it at all and the monitor would otherwise just show
 * "offline" — indistinguishable from the server actually being down, which is
 * the question the page exists to answer. The directory is reachable from
 * anywhere and its counts are accurate to within about a minute.
 *
 * It anonymises the roster, so `players` is deliberately left empty rather than
 * filled with `Anon0`, `Anon1`, …; the UI explains the gap. Returns null when
 * the directory cannot answer either, leaving the caller to report offline.
 */
async function readDirectory(
  host: string,
  startedAt: number,
): Promise<FivemSnapshot | null> {
  const joinCode =
    process.env.FIVEM_JOIN_CODE?.trim() ||
    (brand.isCrimson ? FIVEM_DEFAULT_JOIN_CODE : "");
  if (!joinCode) return null;
  try {
    const res = await undiciFetch(`${FIVEM_DIRECTORY_URL}/${joinCode}`, {
      dispatcher: directoryDispatcher,
      signal: AbortSignal.timeout(FIVEM_FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;

    const parsed = fivemDirectorySchema.safeParse(await res.json());
    const data = parsed.success ? parsed.data.Data : undefined;
    if (!data) return null;

    // A server that has dropped off the list keeps its record for a while, so
    // trust the directory only while its own timestamp is recent.
    if (data.lastSeen) {
      const age = Date.now() - new Date(data.lastSeen).getTime();
      if (Number.isFinite(age) && age > FIVEM_DIRECTORY_MAX_AGE_MS) return null;
    }

    const maxClients = data.svMaxclients ?? data.sv_maxclients ?? null;
    return {
      online: true,
      host,
      connectUri: `fivem://connect/${host}`,
      hostname: data.hostname ? stripColorCodes(data.hostname) : null,
      projectName: data.vars?.sv_projectName?.trim() ?? null,
      players: [],
      playerCount: data.clients ?? 0,
      maxClients: maxClients && maxClients > 0 ? maxClients : null,
      latencyMs: Date.now() - startedAt,
      fetchedAt: new Date().toISOString(),
      error: null,
      source: "directory",
    };
  } catch {
    return null;
  }
}

/**
 * A dead relay and a dead game server are different problems with different
 * fixes, and the monitor is the only place either becomes visible. Name the one
 * that actually failed so nobody goes hunting the game server when the machine
 * at home is simply asleep.
 */
function offlineMessage(source: EndpointSource, err: unknown): string {
  // A 502 means whatever we talked to reached us and is reporting that the game
  // server did not answer IT. Blaming the relay machine there sends whoever is
  // on call to the wrong box — it is awake and answering.
  if (err instanceof HttpStatusError && err.status === 502) {
    return "The game server is not responding.";
  }
  if (source === "uplink") return "Could not reach the relay machine.";
  return err instanceof Error && err.name === "TimeoutError"
    ? "The server did not respond in time."
    : "Could not reach the server.";
}

/**
 * Whether to consult the public directory after a failed read.
 *
 * Only when we have no information at all. A 502 from the relay IS information:
 * it reached us, and it is reporting first-hand that the game server did not
 * answer *it*. The directory's record is minutes old, so falling back there
 * would let a stale "online" override a live "the server is down" — and the
 * banner would then blame the relay machine, which is awake and answering.
 * Reserve the fallback for the case it was built for: the relay being gone.
 */
function shouldTryDirectory(err: unknown): boolean {
  return !(err instanceof HttpStatusError && err.status === 502);
}

// Warm-instance cache. `/api/fivem` is force-dynamic and every Super Admin tab
// polls it every 10s, so without this each poll fans three live fetches at the
// game server. Shared across all callers on the instance; concurrent misses are
// coalesced into one computation.
let snapshotCache: { at: number; value: FivemSnapshot } | null = null;
let snapshotInFlight: Promise<FivemSnapshot> | null = null;

/**
 * Live snapshot of the configured FiveM server, cached for
 * `FIVEM_SNAPSHOT_CACHE_MS`. Never throws — a failure (server down, timeout,
 * unexpected payload) resolves to an offline snapshot carrying a human-readable
 * `error`.
 */
export async function getServerSnapshot(): Promise<FivemSnapshot> {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.at < FIVEM_SNAPSHOT_CACHE_MS) {
    return snapshotCache.value;
  }
  if (snapshotInFlight) return snapshotInFlight;

  snapshotInFlight = (async () => {
    try {
      const value = await computeServerSnapshot();
      snapshotCache = { at: Date.now(), value };
      return value;
    } finally {
      snapshotInFlight = null;
    }
  })();
  return snapshotInFlight;
}

async function computeServerSnapshot(): Promise<FivemSnapshot> {
  const { candidates, source, publishedAt } = await candidateEndpoints();
  if (!candidates[0]) {
    return offlineSnapshot(
      "",
      "Configure the FiveM server for this deployment.",
      null,
    );
  }
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
    // No route at all. Before declaring it offline, ask the public directory —
    // it can still say whether the server is up and how busy it is.
    const viaDirectory = shouldTryDirectory(lastErr)
      ? await readDirectory(host, startedAt)
      : null;
    if (viaDirectory) return viaDirectory;

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
    const viaDirectory = shouldTryDirectory(err)
      ? await readDirectory(host, startedAt)
      : null;
    if (viaDirectory) return viaDirectory;

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
    source: "server",
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
  const targets = candidates.filter(Boolean).map((base) => ({
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
