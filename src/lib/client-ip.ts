/**
 * The caller's IP for rate-limit keys, or null when it cannot be trusted.
 *
 * Forwarding headers are client-controlled unless a proxy the app trusts
 * rewrites them. Vercel's edge overwrites `x-real-ip` / `x-forwarded-for`
 * (and sets `x-vercel-forwarded-for`) on every request, so on Vercel they are
 * safe. Anywhere else they are spoofable — rotating them would give an
 * attacker a fresh per-IP bucket on every attempt — so they are ignored unless
 * `TRUST_PROXY_HEADERS=1` says a trusted reverse proxy sits in front.
 *
 * A null result means "skip the per-IP limiter"; the per-username limiter is
 * the brute-force guard and never depends on the IP.
 */
export function clientIpFromHeaders(
  headers: { get(name: string): string | null },
  env: { VERCEL?: string; TRUST_PROXY_HEADERS?: string },
): string | null {
  const trusted = env.VERCEL === "1" || env.TRUST_PROXY_HEADERS === "1";
  if (!trusted) return null;

  const candidate =
    headers.get("x-real-ip") ??
    headers.get("x-vercel-forwarded-for")?.split(",")[0] ??
    headers.get("x-forwarded-for")?.split(",")[0];
  const ip = candidate?.trim().slice(0, 64);
  return ip ? ip : null;
}
