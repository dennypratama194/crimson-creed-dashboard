/**
 * Shared safety check for the data scripts.
 *
 * Local dev and production are SEPARATE Supabase projects. These helpers make
 * every script say out loud which one it is about to touch, and stop the
 * destructive ones from running against production by accident.
 *
 *   .env.local       → SUPABASE_ENV="development"   (committed in .env.example)
 *   .env.prod.local  → SUPABASE_ENV="production"    (git-ignored; the one-off
 *                      catalogue import + create-admin against the prod project)
 *
 * Destructive scripts call assertSafeToWipe(); everything else calls
 * announceTarget(). Override a deliberate prod wipe with ALLOW_DESTRUCTIVE=1.
 */
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const envName = (process.env.SUPABASE_ENV ?? "").trim().toLowerCase();

function targetHost(): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return rawUrl || "(NEXT_PUBLIC_SUPABASE_URL not set)";
  }
}

/** Print the target database + its dev/prod marker. Safe to call from any script. */
export function announceTarget(script: string): void {
  console.log(
    `[${script}] target: ${targetHost()}  (SUPABASE_ENV=${envName || "unmarked"})`,
  );
}

/**
 * Abort a destructive script unless it is pointed at a database explicitly
 * marked as development. ALLOW_DESTRUCTIVE=1 forces it through for a deliberate
 * production reset.
 */
export function assertSafeToWipe(script: string): void {
  announceTarget(script);

  if (process.env.ALLOW_DESTRUCTIVE === "1") {
    console.warn(`[${script}] ALLOW_DESTRUCTIVE=1 set — proceeding anyway.`);
    return;
  }

  if (envName !== "development") {
    console.error(
      `\n[${script}] refusing to run.\n` +
        `  SUPABASE_ENV is "${envName || "unset"}", not "development", and this ` +
        `script deletes data.\n` +
        `  Point it at your dev project (.env.local), or set ALLOW_DESTRUCTIVE=1 ` +
        `to wipe ${targetHost()} on purpose.\n`,
    );
    process.exit(1);
  }
}
