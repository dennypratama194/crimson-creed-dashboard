/**
 * Historical migration protection.
 *
 * Migrations are forward-only. Once a file has been merged it describes what
 * the deployed database actually did; editing, renaming or deleting it makes
 * the repo disagree with production, and `supabase db push` will not re-run it
 * to fix that. So: a migration that exists on the BASE branch must arrive at
 * the merge byte-for-byte identical.
 *
 * What this does NOT do, deliberately:
 *   * it does not hard-code a migration number — the boundary is "what the base
 *     branch has", which moves on its own;
 *   * it does not stop you editing a migration you ADDED in this same branch.
 *     Until it merges it is a draft, and forcing a 0077b on top of an unmerged
 *     0077 would be silly;
 *   * it does not police numbering gaps. A gap means a migration was dropped
 *     before merging, which is normal. Filling one in later with invented SQL
 *     is the actual mistake, and that shows up here as an ADDED file below the
 *     highest base number — which it warns about rather than fails, because a
 *     legitimate out-of-order merge happens too.
 *
 * Usage:
 *   npm run check:migrations                 # against origin/main, or main
 *   BASE_REF=origin/release npm run check:migrations
 */
import { spawnSync } from "node:child_process";

const DIR = "supabase/migrations";

function git(args, { allowFail = false } = {}) {
  const r = spawnSync("git", args, { encoding: "utf8" });
  if (r.status !== 0) {
    if (allowFail) return null;
    console.error(`git ${args.join(" ")} failed:\n${r.stderr}`);
    process.exit(1);
  }
  return r.stdout.trim();
}

/**
 * The commit this branch actually forked from — not simply the tip of the base
 * branch, which would report every migration merged since as "deleted".
 */
function resolveBase() {
  const explicit = process.env.BASE_REF;
  // GitHub Actions sets these on a pull_request event.
  const ciBase = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : null;

  for (const ref of [explicit, ciBase, "origin/main", "main"].filter(Boolean)) {
    if (
      git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
        allowFail: true,
      })
    ) {
      const mergeBase = git(["merge-base", "HEAD", ref], { allowFail: true });
      if (mergeBase) return { ref, commit: mergeBase };
    }
  }
  return null;
}

const base = resolveBase();
if (!base) {
  console.log(
    "No base branch found (no origin/main, no main, no BASE_REF).\n" +
      "Nothing to compare against — skipping the historical migration check.",
  );
  process.exit(0);
}

// No early exit when the merge-base is HEAD: on the base branch itself that is
// still worth running, because `git diff <commit>` below compares the commit to
// the WORKING TREE. An uncommitted edit to a historical migration is exactly
// the thing this is here to catch, and catching it before the commit is better
// than catching it in review.

console.log(
  `Comparing migrations against ${base.ref} (${base.commit.slice(0, 8)})`,
);

// --find-renames so a rename shows as R, not as a delete + an add.
const raw = git([
  "diff",
  "--name-status",
  "--find-renames",
  `${base.commit}`,
  "--",
  DIR,
]);

const violations = [];
const added = [];

for (const line of raw.split("\n").filter(Boolean)) {
  const parts = line.split("\t");
  const code = parts[0];
  const path = parts[1];
  const newPath = parts[2];

  if (code.startsWith("A")) {
    added.push(path);
  } else if (code.startsWith("M")) {
    violations.push(`MODIFIED  ${path}`);
  } else if (code.startsWith("D")) {
    violations.push(`DELETED   ${path}`);
  } else if (code.startsWith("R")) {
    violations.push(`RENAMED   ${path} -> ${newPath}`);
  } else if (code.startsWith("T")) {
    violations.push(`RETYPED   ${path}`);
  }
}

// An untracked file is not in `git diff`, but it is still a migration someone
// is about to add — list it with the rest so the numbering warning sees it.
for (const f of (
  git(["ls-files", "--others", "--exclude-standard", "--", DIR], {
    allowFail: true,
  }) ?? ""
)
  .split("\n")
  .filter(Boolean)) {
  if (!added.includes(f)) added.push(f);
}
added.sort();

if (added.length) {
  console.log(`\nNew migrations in this branch (${added.length}):`);
  for (const f of added) console.log(`  + ${f}`);
}

// Advisory: a new file numbered below something the base already has will be
// skipped by anyone whose database is already past that number.
const numberOf = (p) => Number(/(\d+)_/.exec(p.split("/").pop())?.[1] ?? NaN);
const baseFiles = (
  git(["ls-tree", "--name-only", base.commit, `${DIR}/`], {
    allowFail: true,
  }) ?? ""
)
  .split("\n")
  .filter(Boolean);
const highestBase = Math.max(
  0,
  ...baseFiles.map(numberOf).filter(Number.isFinite),
);
const backfilled = added.filter((f) => numberOf(f) < highestBase);
if (backfilled.length) {
  console.warn(
    `\n!  These are numbered BELOW ${String(highestBase).padStart(4, "0")}, the ` +
      `highest on ${base.ref}:\n` +
      backfilled.map((f) => `!    ${f}`).join("\n") +
      `\n!  A database already past that number will never run them. This is fine\n` +
      `!  for a branch that forked earlier, and a mistake if you are filling in a\n` +
      `!  numbering gap — those need a new number at the end instead.`,
  );
}

if (violations.length) {
  console.error(
    `\nHistorical migrations changed. They are forward-only:\n` +
      violations.map((v) => `  ${v}`).join("\n") +
      `\n\nThese files already ran against the deployed database. Restore them:\n` +
      `  git checkout ${base.commit} -- ${DIR}\n` +
      `and put the change in a NEW migration at the end of the sequence.\n`,
  );
  process.exit(1);
}

console.log("\nNo historical migration was modified, renamed or deleted.");
