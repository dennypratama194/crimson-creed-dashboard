#!/usr/bin/env node
/* eslint-disable no-console -- standalone CLI; stdout is its only interface. */
/**
 * FiveM relay — run this on a machine whose network can actually reach the game
 * server, expose it with a tunnel, and point the deployed app's
 * `FIVEM_SERVER_URL` at the tunnel URL.
 *
 * Why this exists: the server (Jakarta, AS131745) black-holes datacenter
 * traffic. Indonesian residential connections get an answer in ~50ms; Vercel
 * gets silence from both `iad1` and `sin1`, on both http and https. Nothing in
 * the app can fix that, so the request has to originate from a network the
 * server is willing to talk to.
 *
 * It mirrors the three paths the app already reads, so no app change is needed
 * beyond repointing `FIVEM_SERVER_URL`.
 *
 *   node tools/fivem-relay.mjs
 *   cloudflared tunnel --url http://localhost:8787     # (or ngrok / tailscale)
 *
 * Env:
 *   PORT            listen port                (default 8787)
 *   FIVEM_UPSTREAM  game server base URL       (default http://main.imeroleplay.com:30120)
 *   CACHE_MS        upstream cache TTL         (default 5000)
 */

import { createServer } from "node:http";

const PORT = Number(process.env.PORT) || 8787;
const UPSTREAM = (
  process.env.FIVEM_UPSTREAM || "http://main.imeroleplay.com:30120"
).replace(/\/+$/, "");
const CACHE_MS = Number(process.env.CACHE_MS) || 5000;
// Must stay UNDER the caller's own timeout (FIVEM_FETCH_TIMEOUT_MS, 4s). If the
// relay waits longer than the app does, the app aborts first and sees a network
// failure — indistinguishable from this machine being asleep. Failing fast here
// lets the relay answer 502 instead, which the app reports as "the game server
// is not responding".
const UPSTREAM_TIMEOUT_MS = 3000;

/** The only paths this relay will forward. Anything else is a 404. */
const ALLOWED = new Set(["/dynamic.json", "/players.json", "/info.json"]);

/**
 * The deployed app polls every 10s and three paths are read per snapshot, so
 * without this the game server would see a burst per viewer. Entries are keyed
 * by path and shared across all callers.
 */
const cache = new Map();

/** Coalesce concurrent misses for the same path into one upstream request. */
const inflight = new Map();

async function fetchUpstream(path) {
  const res = await fetch(`${UPSTREAM}${path}`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`upstream responded ${res.status}`);
  return res.text();
}

async function readPath(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;

  const pending = inflight.get(path);
  if (pending) return pending;

  const task = fetchUpstream(path)
    .then((body) => {
      cache.set(path, { body, at: Date.now() });
      return body;
    })
    .finally(() => inflight.delete(path));

  inflight.set(path, task);
  return task;
}

const server = createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;

  if (path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, upstream: UPSTREAM }));
    return;
  }

  if (!ALLOWED.has(path)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  readPath(path)
    .then((body) => {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(body);
    })
    .catch((err) => {
      console.error(`[relay] ${path} failed:`, err.message);
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "upstream unreachable" }));
    });
});

server.listen(PORT, () => {
  console.log(`[relay] listening on http://localhost:${PORT}`);
  console.log(`[relay] upstream ${UPSTREAM}, cache ${CACHE_MS}ms`);
  console.log(`[relay] paths: ${[...ALLOWED].join(", ")}`);
});
