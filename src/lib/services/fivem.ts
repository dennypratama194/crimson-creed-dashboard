import "server-only";

import { Agent, fetch as undiciFetch } from "undici";

import {
  FIVEM_DEFAULT_ENDPOINT,
  FIVEM_DEFAULT_JOIN_CODE,
  FIVEM_DIRECTORY_MAX_AGE_MS,
  FIVEM_DIRECTORY_SNAPSHOT_CACHE_MS,
  FIVEM_DIRECTORY_URL,
  FIVEM_FETCH_TIMEOUT_MS,
  FIVEM_INFO_CACHE_MS,
  FIVEM_INFO_RETRY_MS,
  FIVEM_OFFLINE_SNAPSHOT_CACHE_MS,
  FIVEM_SNAPSHOT_CACHE_MS,
  FIVEM_TRANSPORT_HEAD_START_MS,
  FIVEM_TRANSPORT_MEMORY_MS,
  FIVEM_UPLINK_MAX_AGE_MS,
  FIVEM_UPSTREAM_BACKOFF_BASE_MS,
  FIVEM_UPSTREAM_BACKOFF_MAX_MS,
} from "@/lib/constants/fivem";
import { brand } from "@/lib/brand";
import { getFivemUplink } from "@/lib/db/fivem";
import type { ServerClient } from "@/lib/supabase/server";
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
async function resolveEndpoint(
  supabase?: ServerClient,
): Promise<ResolvedEndpoint> {
  const strip = (value: string) => value.replace(/\/+$/, "");

  const uplink = await getFivemUplink(supabase);
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
async function candidateEndpoints(
  supabase?: ServerClient,
): Promise<ResolvedEndpoint & { candidates: [string, ...string[]] }> {
  const resolved = await resolveEndpoint(supabase);
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

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(FIVEM_FETCH_TIMEOUT_MS);
  const res = await undiciFetch(url, {
    dispatcher: fivemDispatcher,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
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
  const url = `${FIVEM_DIRECTORY_URL}/${joinCode}`;
  if (upstreamBackoff.blocked(url)) return null;
  const snapshot = await fetchDirectory(url, host, startedAt);
  if (snapshot) upstreamBackoff.succeed(url);
  else upstreamBackoff.fail(url, null);
  return snapshot;
}

async function fetchDirectory(
  url: string,
  host: string,
  startedAt: number,
): Promise<FivemSnapshot | null> {
  try {
    const res = await undiciFetch(url, {
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

// ── upstream state (warm instance only) ──────────────────────────────────
//
// Everything below lives in module scope, so it is shared by every request an
// instance serves and by nothing else. Vercel runs many instances and starts
// cold ones at will: each keeps its own snapshot, remembered transport, info
// cache and backoff, and a fresh instance starts from nothing. That bounds the
// upstream traffic per warm instance; it does not make it global. Nothing here
// is user data — the route and the page authorize the Super Admin before any
// of it is read.

/**
 * Consecutive failures per upstream (keyed by the resolved endpoint, or the
 * directory URL), with the earliest time it may be tried again. An endpoint
 * change is a new key, so a relay that republishes a new address is tried at
 * once rather than inheriting the old one's backoff.
 */
class UpstreamBackoff {
  private entries = new Map<
    string,
    { failures: number; retryAt: number; lastError: unknown }
  >();

  blocked(key: string): boolean {
    const entry = this.entries.get(key);
    return entry !== undefined && Date.now() < entry.retryAt;
  }

  lastError(key: string): unknown {
    return this.entries.get(key)?.lastError;
  }

  fail(key: string, error: unknown) {
    const failures = (this.entries.get(key)?.failures ?? 0) + 1;
    const delay = Math.min(
      FIVEM_UPSTREAM_BACKOFF_MAX_MS,
      FIVEM_UPSTREAM_BACKOFF_BASE_MS * 2 ** Math.min(failures - 1, 16),
    );
    // A handful of keys at most; never let a churning uplink grow the map.
    if (!this.entries.has(key) && this.entries.size >= 8) this.entries.clear();
    this.entries.set(key, {
      failures,
      retryAt: Date.now() + delay,
      lastError: error,
    });
  }

  succeed(key: string) {
    this.entries.delete(key);
  }
}

const upstreamBackoff = new UpstreamBackoff();

/** The transport that last answered for an endpoint, until it expires. */
let rememberedTransport: { key: string; base: string; until: number } | null =
  null;

/** `info.json` for one endpoint. Replaced, not accumulated, when it changes. */
let infoCache: {
  endpoint: string;
  until: number;
  projectName: string | null;
} | null = null;

let snapshotCache: { until: number; value: FivemSnapshot } | null = null;
let snapshotInFlight: Promise<FivemSnapshot> | null = null;

/**
 * How long a snapshot is served from the warm-instance cache: half the client
 * cadence for the same state (see `fivemRefreshInterval`), so one open tab
 * always gets a fresh read and several collapse into one upstream call.
 */
export function snapshotCacheMs(
  snapshot: Pick<FivemSnapshot, "online" | "source">,
): number {
  if (snapshot.source === "directory") return FIVEM_DIRECTORY_SNAPSHOT_CACHE_MS;
  return snapshot.online
    ? FIVEM_SNAPSHOT_CACHE_MS
    : FIVEM_OFFLINE_SNAPSHOT_CACHE_MS;
}

/**
 * Live snapshot of the configured FiveM server, cached per warm instance for
 * `snapshotCacheMs`. Never throws — a failure (server down, timeout,
 * unexpected payload) resolves to an offline snapshot carrying a human-readable
 * `error`. Concurrent misses are coalesced into one computation.
 *
 * Callers authorize first: the route and the page both require a Super Admin
 * before calling this, because a cached snapshot needs no database read that
 * RLS could refuse. `supabase` lets a route handler reuse the client it already
 * authorized with for the uplink lookup.
 */
export async function getServerSnapshot(
  options: { supabase?: ServerClient } = {},
): Promise<FivemSnapshot> {
  if (snapshotCache && Date.now() < snapshotCache.until) {
    return snapshotCache.value;
  }
  if (snapshotInFlight) return snapshotInFlight;

  snapshotInFlight = (async () => {
    try {
      const value = await computeServerSnapshot(options.supabase);
      snapshotCache = { until: Date.now() + snapshotCacheMs(value), value };
      return value;
    } finally {
      snapshotInFlight = null;
    }
  })();
  return snapshotInFlight;
}

/**
 * `dynamic.json` from whichever transport answers first. Every request gets
 * its own AbortController, and the moment one wins the others are aborted so
 * a losing transport does not keep a socket open until its timeout.
 *
 * With a remembered transport, that one starts alone and the rest join after
 * `FIVEM_TRANSPORT_HEAD_START_MS` — or immediately, if it fails first. In the
 * normal case that is one upstream request instead of two; when the network
 * changed under us it is still one race, not two sequential timeouts.
 */
function raceDynamic(
  candidates: readonly string[],
  preferred: string | null,
): Promise<{ base: string; raw: unknown }> {
  const ordered =
    preferred && candidates.includes(preferred)
      ? [preferred, ...candidates.filter((c) => c !== preferred)]
      : [...candidates];
  const controllers = ordered.map(() => new AbortController());
  const errors = new Map<string, unknown>();

  return new Promise((resolve, reject) => {
    let settled = false;
    let started = 0;
    let failed = 0;
    let headStart: ReturnType<typeof setTimeout> | null = null;

    const start = (i: number) => {
      started += 1;
      const base = ordered[i]!;
      getJson(`${base}/dynamic.json`, controllers[i]!.signal).then(
        (raw) => {
          if (settled) return;
          settled = true;
          if (headStart) clearTimeout(headStart);
          controllers.forEach((c, j) => {
            if (j !== i) c.abort();
          });
          resolve({ base, raw });
        },
        (err: unknown) => {
          if (settled) return;
          errors.set(base, err);
          failed += 1;
          if (started < ordered.length) {
            startRest();
          } else if (failed === ordered.length) {
            settled = true;
            // Report in configured order: the first candidate's cause is the
            // one `offlineMessage` / `shouldTryDirectory` should judge.
            reject(new AggregateError(candidates.map((c) => errors.get(c))));
          }
        },
      );
    };
    const startRest = () => {
      if (headStart) clearTimeout(headStart);
      headStart = null;
      for (let i = started; i < ordered.length; i += 1) start(i);
    };

    if (preferred && ordered[0] === preferred && ordered.length > 1) {
      start(0);
      headStart = setTimeout(startRest, FIVEM_TRANSPORT_HEAD_START_MS);
    } else {
      startRest();
    }
  });
}

/** `sv_projectName` for an endpoint, from cache when it is still fresh. */
async function readProjectName(endpoint: string): Promise<string | null> {
  const now = Date.now();
  if (infoCache && infoCache.endpoint === endpoint && now < infoCache.until) {
    return infoCache.projectName;
  }
  try {
    const info = fivemInfoSchema.safeParse(
      await getJson(`${endpoint}/info.json`),
    );
    const projectName = info.success
      ? (info.data.vars?.sv_projectName?.trim() ?? null)
      : null;
    infoCache = { endpoint, until: now + FIVEM_INFO_CACHE_MS, projectName };
    return projectName;
  } catch {
    // Optional data. Keep a previous good name for the same endpoint, and do
    // not ask again on every snapshot.
    const previous =
      infoCache?.endpoint === endpoint ? infoCache.projectName : null;
    infoCache = {
      endpoint,
      until: now + FIVEM_INFO_RETRY_MS,
      projectName: previous,
    };
    return previous;
  }
}

async function computeServerSnapshot(
  supabase?: ServerClient,
): Promise<FivemSnapshot> {
  const { base, candidates, source, publishedAt } =
    await candidateEndpoints(supabase);
  if (!candidates[0]) {
    return offlineSnapshot(
      "",
      "Configure the FiveM server for this deployment.",
      null,
    );
  }
  const host = resolvePublicHost(candidates[0], source);
  const startedAt = Date.now();

  // Still inside the backoff window from the last failure: do not knock on a
  // server that just ignored us. The directory (under its own backoff) can
  // still answer whether it is up.
  if (upstreamBackoff.blocked(base)) {
    const lastErr = upstreamBackoff.lastError(base);
    const viaDirectory = shouldTryDirectory(lastErr)
      ? await readDirectory(host, startedAt)
      : null;
    return (
      viaDirectory ??
      offlineSnapshot(host, offlineMessage(source, lastErr), null)
    );
  }

  const remembered =
    rememberedTransport &&
    rememberedTransport.key === base &&
    Date.now() < rememberedTransport.until
      ? rememberedTransport.base
      : null;

  // Race the transports rather than trying them in turn: whichever answers
  // `dynamic.json` first wins and its response is kept. Sequential attempts
  // would cost the sum of both timeouts on a server that ignores us, which
  // overruns the platform's function limit before we can return "offline".
  let endpoint: string | null = null;
  let dynamicRaw: unknown;
  let lastErr: unknown;
  try {
    const won = await raceDynamic(candidates, remembered);
    endpoint = won.base;
    dynamicRaw = won.raw;
    rememberedTransport = {
      key: base,
      base: won.base,
      until: Date.now() + FIVEM_TRANSPORT_MEMORY_MS,
    };
  } catch (err) {
    // AggregateError — every transport failed. Report the first cause.
    lastErr = err instanceof AggregateError ? (err.errors[0] ?? err) : err;
    if (rememberedTransport?.key === base) rememberedTransport = null;
  }

  if (endpoint === null) {
    const latencyMs = Date.now() - startedAt;
    upstreamBackoff.fail(base, lastErr);
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
  let projectName: string | null;
  try {
    [playersRaw, projectName] = await Promise.all([
      getJson(`${endpoint}/players.json`),
      readProjectName(endpoint),
    ]);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    upstreamBackoff.fail(base, err);
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
  upstreamBackoff.succeed(base);

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
export async function probeServer(
  supabase?: ServerClient,
): Promise<FivemProbe> {
  const { candidates, source, publishedAt } =
    await candidateEndpoints(supabase);
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
