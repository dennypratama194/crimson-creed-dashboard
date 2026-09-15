/**
 * `npm run db:types` — regenerate src/lib/database.types.ts.
 *
 * The old script was:
 *
 *   supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * which has three problems, all of which have bitten this kind of setup before:
 *
 *   1. The shell truncates the target BEFORE the command runs. If `supabase`
 *      is missing, the project is not linked, or the network drops, the file
 *      is left EMPTY and every import in the app breaks at once.
 *   2. On Windows, PowerShell's `>` writes UTF-16LE. The file then reads as
 *      mojibake to tsc, git shows the whole file as changed, and Prettier
 *      rewrites it on the next commit.
 *   3. It targets `--linked`, which on this project means the PRODUCTION
 *      Supabase project. Regenerating types is not a reason to reach for it.
 *
 * This script writes to a temp file, sanity-checks the output, and only then
 * replaces the real one. It prefers a local, migration-built schema and will
 * not touch the linked project unless explicitly asked.
 *
 * Usage:
 *   npm run db:types                       # local stack (supabase start)
 *   DB_URL=postgres://… npm run db:types   # an explicit throwaway database
 *   npm run db:types -- --linked           # the hosted project, opt-in only
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(ROOT, "src", "lib", "database.types.ts");

const args = process.argv.slice(2);
const wantsLinked = args.includes("--linked");
const dbUrl = process.env.DB_URL;

/** The generator's arguments, in order of preference. */
function generatorArgs() {
  if (dbUrl) return ["gen", "types", "typescript", "--db-url", dbUrl];
  if (wantsLinked) {
    console.warn(
      "\n!  --linked generates from the HOSTED project. This is a read, but it\n" +
        "!  is still production. Prefer `supabase start` and a local schema, or\n" +
        "!  DB_URL pointing at a database built from supabase/migrations.\n",
    );
    return ["gen", "types", "typescript", "--linked"];
  }
  return ["gen", "types", "typescript", "--local"];
}

const argv = generatorArgs();
console.log(`Running: supabase ${argv.join(" ")}`);

// Capture as a buffer and decode explicitly — never let a shell redirect pick
// the encoding for us.
const result = spawnSync("npx", ["--no-install", "supabase", ...argv], {
  cwd: ROOT,
  encoding: "buffer",
  shell: process.platform === "win32",
  maxBuffer: 64 * 1024 * 1024,
});

if (result.error) {
  console.error(`\nCould not run the Supabase CLI: ${result.error.message}`);
  console.error("The existing types file was left untouched.");
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`\nsupabase gen types exited ${result.status}:`);
  console.error(result.stderr?.toString("utf8").trim() || "(no output)");
  console.error("\nThe existing types file was left untouched.");
  process.exit(1);
}

/** Decode UTF-8, tolerating a BOM or a UTF-16LE payload from an odd shell. */
function decode(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString("utf16le");
  const text = buf.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const generated = decode(result.stdout).replace(/\r\n/g, "\n");

// Sanity gate. An empty or truncated generation must never reach the repo.
const problems = [];
if (generated.trim().length < 500)
  problems.push("output is suspiciously short");
if (!/export\s+(type|interface)\s+Database\b/.test(generated)) {
  problems.push("no `Database` type in the output");
}
if (problems.length) {
  console.error(`\nRefusing to write the types file: ${problems.join("; ")}.`);
  console.error("First 400 characters of what came back:\n");
  console.error(generated.slice(0, 400));
  process.exit(1);
}

// Custom contracts must not be in here — that is the whole point of the split.
const contracts = ["AdminDashboardPayload", "CashSummaryPayload"];
const strays = contracts.filter((c) => generated.includes(c));
if (strays.length) {
  console.error(
    `\nGenerated output unexpectedly contains ${strays.join(", ")}. ` +
      "Application contracts belong in src/lib/db/contracts.ts.",
  );
  process.exit(1);
}

const scratch = join(tmpdir(), "crimson-db-types");
if (!existsSync(scratch)) mkdirSync(scratch, { recursive: true });
const temp = join(scratch, `database.types.${process.pid}.ts`);

const header = `/**
 * Supabase SCHEMA types — tables, enums, function signatures.
 *
 * GENERATED FILE. Rewritten whole by \`npm run db:types\`
 * (scripts/gen-types.mjs). Do not hand-edit, and do not add application
 * contracts here — jsonb RPC payload shapes live in src/lib/db/contracts.ts,
 * which no generator touches.
 */

`;

writeFileSync(temp, header + generated, { encoding: "utf8" });

const previous = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
renameSync(temp, TARGET);

console.log(
  previous === header + generated
    ? "\nTypes are already up to date."
    : `\nWrote ${TARGET}`,
);
console.log(
  "Next: `npm run typecheck` and `npm run test` — a schema change can move a\n" +
    "contract in src/lib/db/contracts.ts too, and nothing regenerates that.",
);
