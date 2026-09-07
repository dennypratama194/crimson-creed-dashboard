/**
 * Create one real Super Admin — an auth user plus its `members` row — for
 * bootstrapping a fresh production project. Mirrors how `seed.ts` provisions an
 * admin, but interactive and strictly non-destructive: it never wipes anything
 * and refuses to run if the username is already taken.
 *
 *   # against the dev project (.env.local):
 *   npm run db:create-admin
 *
 *   # against a fresh production project:
 *   npx tsx --env-file=.env.prod.local supabase/create-admin.ts
 *
 * Values come from flags or interactive prompts (flags win):
 *   --email     login email                              (prompted if omitted)
 *   --username  3–32 chars, unique (case-insensitive)    (prompted if omitted)
 *   --name      display name                             (prompted if omitted)
 *   --rank      BOSS | UNDER_BOSS | SECRETARY | CAPOREGIME | SOLDIER  (default BOSS)
 *   --password  min 8 chars — better via ADMIN_PASSWORD env or the hidden
 *               prompt than a flag (flags leak into shell history)
 *   --dry       validate and report, write nothing
 *
 * Requires env (tsx reads it from the --env-file you pass):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Runs as the service role (RLS bypassed) — like seed.ts, it writes no
 * audit_logs row. Use the admin UI for member changes after launch.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database, MemberRank } from "../src/lib/database.types";
import { announceTarget } from "./_env-guard";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "(tsx reads them from the --env-file you pass).",
  );
  process.exit(1);
}

const RANKS: readonly MemberRank[] = [
  "BOSS",
  "UNDER_BOSS",
  "SECRETARY",
  "CAPOREGIME",
  "SOLDIER",
];

const DRY = process.argv.includes("--dry");

const KEY_ESC = "\u001b";
const KEY_EOT = "\u0004";
const KEY_ETX = "\u0003";
const KEY_DEL = "\u007f";
const KEY_BS = "\b";

/** Read `--name value` or `--name=value` from argv. */
function flag(name: string): string | undefined {
  const eq = `--${name}=`;
  const inline = process.argv.find((a) => a.startsWith(eq));
  if (inline) return inline.slice(eq.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && i + 1 < process.argv.length) {
    const next = process.argv[i + 1]!;
    if (!next.startsWith("--")) return next;
  }
  return undefined;
}

/** Prompt for a secret without echoing keystrokes. Falls back to a plain read
 *  when stdin is not a TTY (piped input). */
function readHidden(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(promptText);
    let buf = "";
    let escaping = false;

    const finish = (value: string | null): void => {
      stdin.off("data", onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (value === null) reject(new Error("Aborted."));
      else resolve(value);
    };

    const onData = (chunk: Buffer): void => {
      for (const ch of chunk.toString("utf8")) {
        if (escaping) {
          // Swallow the rest of a CSI sequence (arrow keys etc.).
          if (/[A-Za-z~]/.test(ch)) escaping = false;
          continue;
        }
        if (ch === KEY_ESC) {
          escaping = true;
        } else if (ch === "\n" || ch === "\r" || ch === KEY_EOT) {
          finish(buf);
          return;
        } else if (ch === KEY_ETX) {
          finish(null);
          return;
        } else if (ch === KEY_DEL || ch === KEY_BS) {
          buf = buf.slice(0, -1);
        } else if (ch >= " ") {
          buf += ch;
        }
      }
    };

    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

/** Page through Auth users to find one by email (case-insensitive). */
async function findUserIdByEmail(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target,
    );
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main(): Promise<void> {
  announceTarget("db:create-admin");

  const admin = createClient<Database>(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let email = flag("email");
  let username = flag("username");
  let displayName = flag("name");
  let rankRaw = flag("rank");

  if (!email || !username || !displayName || !rankRaw) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      if (!email) email = (await rl.question("Login email: ")).trim();
      if (!username)
        username = (await rl.question("Username (3–32 chars): ")).trim();
      if (!displayName)
        displayName = (await rl.question("Display name: ")).trim();
      if (!rankRaw)
        rankRaw = (await rl.question("Rank [BOSS]: ")).trim() || "BOSS";
    } finally {
      rl.close();
    }
  }

  const uname = (username ?? "").trim();
  const dname = (displayName ?? "").trim();
  const rank = (rankRaw ?? "BOSS").toUpperCase() as MemberRank;

  let password = flag("password") ?? process.env.ADMIN_PASSWORD;
  if (!password && !DRY) {
    password = await readHidden("Password (min 8 chars, hidden): ");
  }

  // ── validate ──────────────────────────────────────────────────────────────
  const problems: string[] = [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    problems.push("email is not a valid address");
  }
  if (uname.length < 3 || uname.length > 32) {
    problems.push("username must be 3–32 characters");
  }
  if (dname.length < 1) problems.push("display name is required");
  if (!RANKS.includes(rank)) {
    problems.push(`rank must be one of: ${RANKS.join(", ")}`);
  }
  if (!DRY && (!password || password.length < 8)) {
    problems.push("password must be at least 8 characters");
  }
  if (problems.length > 0) {
    console.error("Cannot create admin:\n  - " + problems.join("\n  - "));
    process.exit(1);
  }

  // ── uniqueness ────────────────────────────────────────────────────────────
  const { data: clash, error: clashErr } = await admin
    .from("members")
    .select("id, username")
    .ilike("username", uname)
    .maybeSingle();
  if (clashErr) throw clashErr;
  if (clash) {
    console.error(
      `A member with username "${clash.username}" already exists (${clash.id}). ` +
        "Pick another username or edit that member in the admin UI.",
    );
    process.exit(1);
  }

  if (DRY) {
    console.log("Dry run — would create this Super Admin:");
    console.log(`  email        : ${email}`);
    console.log(`  username     : ${uname}`);
    console.log(`  display name : ${dname}`);
    console.log(`  rank         : ${rank}`);
    console.log("  role         : SUPER_ADMIN");
    console.log("  status       : ACTIVE");
    console.log("\nNothing written.");
    return;
  }

  // ── create the auth user ──────────────────────────────────────────────────
  console.log("Creating auth user…");
  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true,
    },
  );

  let userId: string;
  if (createErr || !created.user) {
    const existing = await findUserIdByEmail(admin, email!);
    if (!existing) throw createErr ?? new Error("createUser failed");
    console.log("Auth user already existed — attaching a member row to it.");
    userId = existing;
  } else {
    userId = created.user.id;
  }

  // ── create the members row ────────────────────────────────────────────────
  console.log("Creating members row…");
  const { data: member, error: memberErr } = await admin
    .from("members")
    .insert({
      user_id: userId,
      username: uname,
      display_name: dname,
      rank,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    })
    .select("id")
    .single();

  if (memberErr || !member) {
    if (created?.user) {
      await admin.auth.admin.deleteUser(userId);
      console.error("Rolled back the auth user we just created.");
    }
    throw memberErr ?? new Error("member insert failed");
  }

  console.log("\nSuper Admin created.");
  console.log(`  member id : ${member.id}`);
  console.log(`  user id   : ${userId}`);
  console.log(`  login     : ${email}`);
  console.log(`  rank      : ${rank}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\nFailed:", err);
    process.exit(1);
  });
