#!/usr/bin/env node
/* eslint-disable no-console -- standalone CLI; stdout is its only interface. */
/**
 * FiveM uplink — the relay, a tunnel in front of it, and the bit that tells the
 * deployment where to find them.
 *
 * The game server answers Indonesian residential connections in ~30ms and
 * black-holes datacenter traffic, so the deployed dashboard cannot read it
 * directly (see tools/fivem-relay.mjs). The fix is to relay through a machine
 * the server will talk to — but a free tunnel's hostname changes on every
 * restart, and the old arrangement pinned that hostname in a deploy-time env
 * var. Every reboot silently broke the monitor until someone edited the hosting
 * dashboard and redeployed.
 *
 * So this publishes the tunnel's current address to the `fivem_uplink` row
 * instead, and re-publishes on a timer. The app reads that row on each poll, so
 * a new hostname is picked up within seconds and no redeploy is ever needed.
 * `updated_at` doubles as a heartbeat: if this process is not running, the row
 * goes stale and the monitor reports the relay machine as unreachable rather
 * than blaming the game server.
 *
 *   node tools/fivem-uplink.mjs
 *
 * On Windows a copy of start.vbs in the Startup folder launches this hidden at
 * logon, which is why everything is also written to a log file — a hidden
 * process has nowhere else to say what went wrong.
 *
 * Env (read from .env.local at the repo root, or the real environment):
 *   NEXT_PUBLIC_SUPABASE_URL     required
 *   SUPABASE_SERVICE_ROLE_KEY    required — writes bypass RLS
 *   FIVEM_RELAY_PORT             relay listen port          (default 8787)
 *   FIVEM_HEARTBEAT_MS           re-publish cadence         (default 60000)
 *   FIVEM_TUNNEL_URL             skip cloudflared and publish this fixed URL
 *                                (for a named tunnel or a reserved ngrok domain)
 */

import { spawn } from "node:child_process";
import { lookup as systemLookup, Resolver } from "node:dns";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Env precedence, highest first: a real environment (a service wrapper may
// provide one), then a relay-specific file, then the app's own .env.local.
// `loadEnvFile` never overrides a key that is already set, so the first source
// to define a key wins.
//
// The relay files matter because the deployment reads a SEPARATE prod Supabase
// project (scripts/split-to-prod.sh repoints Vercel at it). The uplink must
// publish to whatever project the deployment reads, which is no longer the dev
// project .env.local points at — so drop a .env.relay.local (or keep
// .env.prod.local) on the relay machine with the prod NEXT_PUBLIC_SUPABASE_URL
// and SUPABASE_SERVICE_ROLE_KEY.
for (const envFile of [".env.relay.local", ".env.prod.local", ".env.local"]) {
  try {
    process.loadEnvFile(join(repoRoot, envFile));
  } catch {
    // Missing file is fine as long as the variables are set another way.
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const PORT = Number(process.env.FIVEM_RELAY_PORT) || 8787;
const HEARTBEAT_MS = Number(process.env.FIVEM_HEARTBEAT_MS) || 60_000;
const FIXED_URL = process.env.FIVEM_TUNNEL_URL?.trim() || null;

/**
 * Run the same uplink on two machines for redundancy. `fivem_uplink` is a single
 * row, so both publishing on a timer would just overwrite each other every
 * heartbeat — harmless (both tunnels reach the same server) but pointless churn,
 * and it leaves a blind spot: when the machine whose URL is in the row dies, the
 * app keeps hitting that dead tunnel until the other machine's next heartbeat.
 *
 * So: one machine is `primary` (always publishes, the default), the other is
 * `standby` — it keeps its relay and tunnel warm but only writes the row once
 * the primary's heartbeat has gone stale, and backs off again as soon as the
 * primary resumes. `FIVEM_STANDBY_TAKEOVER_MS` is how long a stale row must sit
 * before the standby steps in; default is three missed primary heartbeats.
 */
const ROLE = (process.env.FIVEM_UPLINK_ROLE || "primary").trim().toLowerCase();
const STANDBY_TAKEOVER_MS =
  Number(process.env.FIVEM_STANDBY_TAKEOVER_MS) || HEARTBEAT_MS * 3;

// ── logging ─────────────────────────────────────────────────────────────────

const logDir = join(process.env.LOCALAPPDATA || tmpdir(), "fivem-uplink");
const logFile = join(logDir, "uplink.log");
try {
  mkdirSync(logDir, { recursive: true });
} catch {
  // Best effort — logging must never be the reason the uplink fails to start.
}

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  try {
    appendFileSync(logFile, `${stamped}\n`);
  } catch {
    // Ignore: a locked or unwritable log is not worth dropping the uplink for.
  }
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  log(
    "[uplink] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(1);
}

const QUICK_TUNNEL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

/**
 * cloudflared is routinely not on PATH for a process started at logon (winget on
 * Windows, `curl` into `~/.local/bin` or Homebrew on macOS all install somewhere
 * a login shell knows about but a launchd/Task Scheduler job does not). Check the
 * usual spots, honour an explicit override, and fall back to PATH.
 */
function resolveCloudflared() {
  const override = process.env.CLOUDFLARED_PATH?.trim();
  if (override) return override;
  const home = homedir();
  const candidates = [
    "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
    "C:\\Program Files\\cloudflared\\cloudflared.exe",
    `${home}\\.cloudflared\\cloudflared.exe`,
    `${home}/.local/bin/cloudflared`,
    "/opt/homebrew/bin/cloudflared",
    "/usr/local/bin/cloudflared",
    "/usr/bin/cloudflared",
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "cloudflared"; // fall back to PATH
}

/**
 * Write the current address into the singleton row. The service key bypasses
 * RLS, which is the only way to write this table — no RPC exposes it, so a
 * browser can never repoint where the server makes requests.
 */
async function publish(endpoint) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/fivem_uplink?id=eq.true`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ endpoint }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`supabase responded ${res.status}: ${await res.text()}`);
  }
}

/**
 * Read the singleton row so a `standby` can tell whether the primary is still
 * alive. Returns `{ endpoint, updatedAt }` or null. Throws on a transport/HTTP
 * error so the caller can decide to publish anyway rather than sit idle on a
 * hiccup.
 */
async function readPublishedRow() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/fivem_uplink?id=eq.true&select=endpoint,updated_at`,
    {
      headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) throw new Error(`supabase responded ${res.status}`);
  const [row] = await res.json();
  return row?.endpoint
    ? { endpoint: row.endpoint, updatedAt: row.updated_at }
    : null;
}

/**
 * Resolve through a public resolver, falling back to the system one.
 *
 * Not paranoia: this machine's router (gpon.net) returns NXDOMAIN for
 * `*.trycloudflare.com` while resolving `trycloudflare.com` itself, so the
 * health check below could never see a tunnel that the rest of the world —
 * including the deployment — resolves fine. Verifying through 1.1.1.1 checks
 * what actually matters: whether the tunnel is reachable from outside.
 */
const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

function publicLookup(hostname, options, cb) {
  resolver.resolve4(hostname, (err, addresses) => {
    if (err || !addresses?.length) return systemLookup(hostname, options, cb);
    if (options?.all) {
      return cb(
        null,
        addresses.map((address) => ({ address, family: 4 })),
      );
    }
    cb(null, addresses[0], 4);
  });
}

/** Don't advertise an address until it actually serves the relay. */
function isServing(base) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new URL(`${base}/health`);
    } catch {
      return resolve(false);
    }
    const send = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      {
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname,
        method: "GET",
        lookup: publicLookup,
        timeout: 8000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitUntilServing(base, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    if (await isServing(base)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const children = [];
let shuttingDown = false;
let current = null;

function spawnChild(label, cmd, args) {
  const child = spawn(cmd, args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.on("error", (err) => log(`[${label}] ${err.message}`));
  return child;
}

// ── relay ───────────────────────────────────────────────────────────────────

const relay = spawnChild("relay", process.execPath, [
  join(repoRoot, "tools", "fivem-relay.mjs"),
]);
const relayOut = (d) =>
  String(d)
    .trimEnd()
    .split("\n")
    .forEach((l) => log(l));
relay.stdout.on("data", relayOut);
relay.stderr.on("data", relayOut);
relay.on("exit", (code) => {
  if (!shuttingDown) {
    log(`[uplink] relay exited (${code}) - shutting down.`);
    shutdown(1);
  }
});

// ── tunnel ──────────────────────────────────────────────────────────────────

/**
 * A quick tunnel prints its hostname once, on startup, and gets a different one
 * every run — so the address is scraped from its output rather than configured.
 * If it dies, cloudflared is restarted and whatever new hostname it reports is
 * published over the old one.
 */
function startQuickTunnel() {
  const proc = spawnChild("tunnel", resolveCloudflared(), [
    "tunnel",
    "--url",
    `http://localhost:${PORT}`,
    "--no-autoupdate",
  ]);

  let announced = false;
  const scan = (buf) => {
    const text = String(buf);
    // cloudflared is chatty at INF level; keep the log to things that went
    // wrong, so a failure to register is visible instead of silent.
    for (const line of text.split("\n")) {
      if (/ERR|error|failed/i.test(line) && line.trim()) {
        log(`[tunnel] ${line.trim()}`);
      }
    }
    const found = QUICK_TUNNEL_RE.exec(text);
    if (!found || announced) return;
    announced = true;
    void adopt(found[0], proc);
  };
  proc.stdout.on("data", scan);
  proc.stderr.on("data", scan);

  // A spawn failure (cloudflared not found) emits `error` but never `exit`, so
  // without this the process would sit with a relay and no tunnel forever.
  let retried = false;
  const retry = (why) => {
    if (shuttingDown || retried) return;
    retried = true;
    log(`[uplink] tunnel ${why} - restarting in 5s.`);
    current = null;
    setTimeout(startQuickTunnel, 5000);
  };
  proc.on("error", (err) => {
    if (err.code === "ENOENT") {
      log(
        "[uplink] cloudflared not found. Install it, put it on PATH, or set " +
          "CLOUDFLARED_PATH to the binary.",
      );
    }
    retry(`failed to start (${err.message})`);
  });
  proc.on("exit", (code) => retry(`exited (${code})`));
}

/**
 * Verify a candidate address end to end, then start advertising it.
 *
 * A hostname cloudflared has printed is not necessarily resolvable yet, and
 * occasionally never becomes so. Giving up at that point would strand the uplink
 * with no address until someone restarted it by hand — the exact failure this
 * whole thing exists to end — so a dud tunnel is torn down and the exit handler
 * brings up a fresh one.
 */
async function adopt(base, proc) {
  log(`[uplink] tunnel up at ${base} - verifying`);
  if (await waitUntilServing(base)) {
    current = base;
    await heartbeat();
    return;
  }
  if (proc) {
    log(`[uplink] ${base} never served /health; recycling tunnel.`);
    proc.kill();
    return;
  }
  // Fixed URL: nothing to recycle, so keep trying until it answers.
  log(`[uplink] ${base} not serving yet; retrying in 15s.`);
  setTimeout(() => void adopt(base, proc), 15_000);
}

/**
 * A standby holds off while the primary's heartbeat is fresh and someone else's
 * URL is in the row. It publishes when the row is stale, empty, or already
 * carries this machine's own URL (it has taken over and must keep the row warm).
 * A read failure is treated as "publish anyway" — better a redundant write than
 * a silent gap.
 */
async function standbyShouldPublish() {
  try {
    const row = await readPublishedRow();
    if (!row || row.endpoint === current) return true;
    const age = Date.now() - new Date(row.updatedAt).getTime();
    if (Number.isFinite(age) && age < STANDBY_TAKEOVER_MS) {
      log(
        `[uplink] standby: primary healthy (${Math.round(age / 1000)}s ago) - holding`,
      );
      return false;
    }
    log(
      `[uplink] standby: primary silent for ${Math.round(age / 1000)}s - taking over`,
    );
    return true;
  } catch (err) {
    log(
      `[uplink] standby: row read failed (${err.message}) - publishing anyway`,
    );
    return true;
  }
}

async function heartbeat() {
  if (!current) return;
  if (ROLE === "standby" && !(await standbyShouldPublish())) return;
  try {
    await publish(current);
    log(`[uplink] published ${current}`);
  } catch (err) {
    log(`[uplink] publish failed: ${err.message}`);
  }
}

// ── lifecycle ───────────────────────────────────────────────────────────────

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(timer);
  for (const child of children) child.kill();
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const timer = setInterval(() => void heartbeat(), HEARTBEAT_MS);

if (FIXED_URL) {
  // A named tunnel or reserved domain is already running elsewhere; this process
  // only keeps the relay alive and the heartbeat fresh.
  log(`[uplink] using fixed tunnel ${FIXED_URL}`);
  void adopt(FIXED_URL.replace(/\/+$/, ""));
} else {
  startQuickTunnel();
}

log(
  `[uplink] role ${ROLE}, relay port ${PORT}, heartbeat ${HEARTBEAT_MS}ms` +
    (ROLE === "standby" ? `, takeover after ${STANDBY_TAKEOVER_MS}ms` : "") +
    `, log ${logFile}`,
);
