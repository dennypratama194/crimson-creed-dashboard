// @vitest-environment node
/**
 * The FiveM proxy against a scripted upstream. Every test gets a fresh module
 * (fresh warm-instance state) and a controllable clock; the fake fetch records
 * each URL it is asked for, so these count real upstream requests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FIVEM_DIRECTORY_SNAPSHOT_CACHE_MS,
  FIVEM_INFO_CACHE_MS,
  FIVEM_OFFLINE_SNAPSHOT_CACHE_MS,
  FIVEM_SNAPSHOT_CACHE_MS,
  FIVEM_UPSTREAM_BACKOFF_BASE_MS,
} from "@/lib/constants/fivem";

type Behaviour =
  { json: unknown; status?: number } | { hang: true } | { error: string };

const upstream = vi.hoisted(() => ({
  routes: new Map<string, Behaviour>(),
  calls: [] as { url: string; signal: AbortSignal | undefined }[],
  uplink: null as null | { endpoint: string; updatedAt: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/brand", () => ({ brand: { isCrimson: true } }));
vi.mock("@/lib/db/fivem", () => ({
  getFivemUplink: async () => upstream.uplink,
}));
vi.mock("undici", () => ({
  Agent: class {},
  fetch: (url: string, init: { signal?: AbortSignal }) => {
    upstream.calls.push({ url, signal: init.signal });
    const b = upstream.routes.get(url) ?? { error: "ECONNREFUSED" };
    if ("hang" in b) {
      return new Promise((_, reject) =>
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      );
    }
    if ("error" in b) return Promise.reject(new TypeError(b.error));
    return Promise.resolve(
      new Response(JSON.stringify(b.json), { status: b.status ?? 200 }),
    );
  },
}));

const HTTPS = "https://main.imeroleplay.com:30120";
const HTTP = "http://main.imeroleplay.com:30120";
const DIRECTORY = "https://frontend.cfx-services.net/api/servers/single/zrvmg4";

const DYNAMIC = { clients: 2, sv_maxclients: 64, hostname: "^1Crimson" };
const PLAYERS = [
  { id: 7, name: "Zed", ping: 40 },
  { id: 3, name: "Amy", ping: 200 },
];
const INFO = { vars: { sv_projectName: "Crimson RP" } };

function serve(base: string, dynamic: Behaviour) {
  upstream.routes.set(`${base}/dynamic.json`, dynamic);
  upstream.routes.set(`${base}/players.json`, { json: PLAYERS });
  upstream.routes.set(`${base}/info.json`, { json: INFO });
}
const callsTo = (suffix: string) =>
  upstream.calls.filter((c) => c.url.endsWith(suffix));

let now = Date.parse("2026-09-29T10:00:00.000Z");
function advance(ms: number) {
  now += ms;
  vi.setSystemTime(now);
}

async function load() {
  return import("@/lib/services/fivem");
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  now = Date.parse("2026-09-29T10:00:00.000Z");
  vi.setSystemTime(now);
  upstream.routes.clear();
  upstream.calls.length = 0;
  upstream.uplink = null;
  delete process.env.FIVEM_SERVER_URL;
  delete process.env.FIVEM_JOIN_CODE;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("transport race", () => {
  it("races both transports once, aborts the loser, then remembers the winner", async () => {
    serve(HTTPS, { hang: true });
    serve(HTTP, { json: DYNAMIC });
    const { getServerSnapshot } = await load();

    const first = await getServerSnapshot();
    expect(first).toMatchObject({ online: true, source: "server" });
    expect(first.players.map((p) => p.name)).toEqual(["Amy", "Zed"]);
    expect(callsTo("/dynamic.json").map((c) => c.url)).toEqual([
      `${HTTPS}/dynamic.json`,
      `${HTTP}/dynamic.json`,
    ]);
    const loser = callsTo("/dynamic.json")[0]!;
    expect(loser.signal?.aborted).toBe(true);

    upstream.calls.length = 0;
    advance(FIVEM_SNAPSHOT_CACHE_MS + 1);
    await getServerSnapshot();
    // Only the remembered transport is asked; the https socket is never opened.
    expect(callsTo("/dynamic.json").map((c) => c.url)).toEqual([
      `${HTTP}/dynamic.json`,
    ]);
  });

  it("a remembered transport that fails hands over within the same request", async () => {
    serve(HTTPS, { error: "ECONNRESET" });
    serve(HTTP, { json: DYNAMIC });
    const { getServerSnapshot } = await load();
    await getServerSnapshot(); // remembers http

    // The network changed: now only https gets through.
    serve(HTTP, { error: "ECONNRESET" });
    serve(HTTPS, { json: DYNAMIC });
    upstream.calls.length = 0;
    advance(FIVEM_SNAPSHOT_CACHE_MS + 1);
    const snap = await getServerSnapshot();
    expect(snap).toMatchObject({ online: true, source: "server" });
    expect(callsTo("/dynamic.json").map((c) => c.url)).toEqual([
      `${HTTP}/dynamic.json`,
      `${HTTPS}/dynamic.json`,
    ]);

    // …and https is what it remembers from now on.
    upstream.calls.length = 0;
    advance(FIVEM_SNAPSHOT_CACHE_MS + 1);
    await getServerSnapshot();
    expect(callsTo("/dynamic.json").map((c) => c.url)).toEqual([
      `${HTTPS}/dynamic.json`,
    ]);
  });

  it("an empty roster on a live server is online with zero players", async () => {
    serve(HTTPS, { json: { clients: 0, sv_maxclients: 64 } });
    upstream.routes.set(`${HTTPS}/players.json`, { json: [] });
    const { getServerSnapshot } = await load();
    const snap = await getServerSnapshot();
    expect(snap).toMatchObject({ online: true, playerCount: 0, players: [] });
  });
});

describe("info.json cache", () => {
  it("is read once per endpoint and re-read when the endpoint changes", async () => {
    const A = "https://relay-a.example";
    const B = "https://relay-b.example";
    upstream.uplink = {
      endpoint: A,
      updatedAt: new Date(now).toISOString(),
    };
    serve(A, { json: DYNAMIC });
    serve(B, { json: DYNAMIC });
    upstream.routes.set(`${B}/info.json`, {
      json: { vars: { sv_projectName: "Renamed" } },
    });
    const { getServerSnapshot } = await load();

    expect((await getServerSnapshot()).projectName).toBe("Crimson RP");
    for (let i = 0; i < 3; i += 1) {
      advance(FIVEM_SNAPSHOT_CACHE_MS + 1);
      upstream.uplink.updatedAt = new Date(now).toISOString();
      await getServerSnapshot();
    }
    expect(callsTo("/info.json")).toHaveLength(1);
    expect(callsTo("/players.json")).toHaveLength(4); // the roster stays live

    upstream.uplink = { endpoint: B, updatedAt: new Date(now).toISOString() };
    advance(FIVEM_SNAPSHOT_CACHE_MS + 1);
    expect((await getServerSnapshot()).projectName).toBe("Renamed");
    expect(callsTo("/info.json").map((c) => c.url)).toEqual([
      `${A}/info.json`,
      `${B}/info.json`,
    ]);
  });

  it("expires", async () => {
    serve(HTTPS, { json: DYNAMIC });
    const { getServerSnapshot } = await load();
    await getServerSnapshot();
    advance(FIVEM_INFO_CACHE_MS + 1);
    await getServerSnapshot();
    expect(callsTo("/info.json")).toHaveLength(2);
  });
});

describe("upstream backoff and recovery", () => {
  it("waits out the backoff before knocking again, uses the directory meanwhile, and recovers", async () => {
    serve(HTTPS, { error: "ETIMEDOUT" });
    serve(HTTP, { error: "ETIMEDOUT" });
    upstream.routes.set(DIRECTORY, {
      json: {
        Data: {
          clients: 41,
          svMaxclients: 64,
          hostname: "Crimson",
          lastSeen: new Date(now).toISOString(),
        },
      },
    });
    const { getServerSnapshot } = await load();

    const first = await getServerSnapshot();
    expect(first).toMatchObject({
      online: true,
      source: "directory",
      playerCount: 41,
      players: [],
    });
    expect(callsTo("/dynamic.json")).toHaveLength(2);

    // Timeline (directory snapshots are cached for 60s, the upstream backoff
    // doubles from 30s): t=60s retry -> fail (next 60s), t=120s retry -> fail
    // (next 120s), t=180s is inside that window.
    const step = FIVEM_DIRECTORY_SNAPSHOT_CACHE_MS + 1;
    expect(FIVEM_UPSTREAM_BACKOFF_BASE_MS).toBeLessThan(step);

    upstream.calls.length = 0;
    advance(step);
    await getServerSnapshot();
    expect(callsTo("/dynamic.json")).toHaveLength(2);

    upstream.calls.length = 0;
    advance(step);
    await getServerSnapshot();
    expect(callsTo("/dynamic.json")).toHaveLength(2);

    upstream.calls.length = 0;
    advance(step);
    const during = await getServerSnapshot();
    expect(callsTo("/dynamic.json")).toHaveLength(0); // backing off
    expect(callsTo("zrvmg4")).toHaveLength(1); // the directory still answers
    expect(during.source).toBe("directory");

    // The server comes back; once the window passes it is read directly again.
    serve(HTTPS, { json: DYNAMIC });
    upstream.calls.length = 0;
    advance(step);
    const back = await getServerSnapshot();
    expect(back).toMatchObject({ online: true, source: "server" });
    expect(callsTo("/dynamic.json").length).toBeGreaterThan(0);

    // Recovered: the next miss goes straight to the server, no backoff left.
    upstream.calls.length = 0;
    advance(FIVEM_SNAPSHOT_CACHE_MS + 1);
    await getServerSnapshot();
    expect(callsTo("/dynamic.json")).toHaveLength(1);
  });

  it("a 502 from the relay stays offline — the directory is not consulted", async () => {
    upstream.uplink = {
      endpoint: "https://relay.example",
      updatedAt: new Date(now).toISOString(),
    };
    upstream.routes.set("https://relay.example/dynamic.json", {
      json: {},
      status: 502,
    });
    upstream.routes.set("http://relay.example/dynamic.json", {
      json: {},
      status: 502,
    });
    const { getServerSnapshot } = await load();
    const snap = await getServerSnapshot();
    expect(snap).toMatchObject({
      online: false,
      error: "The game server is not responding.",
    });
    // 30s later: first backoff over, retry fails again (next wait 60s).
    advance(FIVEM_OFFLINE_SNAPSHOT_CACHE_MS + 1);
    await getServerSnapshot();
    expect(callsTo("/dynamic.json")).toHaveLength(4);
    // 30s after that: cache gone, backoff not — no upstream call at all.
    advance(FIVEM_OFFLINE_SNAPSHOT_CACHE_MS + 1);
    const during = await getServerSnapshot();
    expect(during.error).toBe("The game server is not responding.");
    expect(callsTo("/dynamic.json")).toHaveLength(4);
    expect(callsTo("zrvmg4")).toHaveLength(0);
  });

  it("a new endpoint is tried at once, not after the old one's backoff", async () => {
    upstream.uplink = {
      endpoint: "https://dead.example",
      updatedAt: new Date(now).toISOString(),
    };
    const { getServerSnapshot } = await load();
    await getServerSnapshot(); // dead + directory (unconfigured route) fail

    upstream.uplink = {
      endpoint: "https://fresh.example",
      updatedAt: new Date(now).toISOString(),
    };
    serve("https://fresh.example", { json: DYNAMIC });
    advance(FIVEM_OFFLINE_SNAPSHOT_CACHE_MS + 1);
    const snap = await getServerSnapshot();
    expect(snap).toMatchObject({ online: true, source: "server" });
  });

  it("a stale uplink is ignored in favour of the configured server", async () => {
    upstream.uplink = {
      endpoint: "https://stale.example",
      updatedAt: new Date(now - 60 * 60_000).toISOString(),
    };
    serve(HTTPS, { json: DYNAMIC });
    const { getServerSnapshot } = await load();
    expect(await getServerSnapshot()).toMatchObject({ online: true });
    expect(upstream.calls.some((c) => c.url.includes("stale.example"))).toBe(
      false,
    );
  });
});

describe("snapshot cache lifetime", () => {
  it("follows the source: live roster shortest, directory longest", async () => {
    const { snapshotCacheMs } = await load();
    const live = snapshotCacheMs({ online: true, source: "server" });
    const offline = snapshotCacheMs({ online: false, source: "server" });
    const directory = snapshotCacheMs({ online: true, source: "directory" });
    expect(live).toBe(FIVEM_SNAPSHOT_CACHE_MS);
    expect(offline).toBe(FIVEM_OFFLINE_SNAPSHOT_CACHE_MS);
    expect(directory).toBe(FIVEM_DIRECTORY_SNAPSHOT_CACHE_MS);
    expect(live).toBeLessThan(offline);
    expect(offline).toBeLessThan(directory);
  });

  it("collapses concurrent misses into one upstream round trip", async () => {
    serve(HTTPS, { json: DYNAMIC });
    const { getServerSnapshot } = await load();
    await Promise.all([
      getServerSnapshot(),
      getServerSnapshot(),
      getServerSnapshot(),
    ]);
    expect(callsTo("/players.json")).toHaveLength(1);
  });
});
