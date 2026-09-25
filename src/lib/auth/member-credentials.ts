/**
 * Members sign in with a username, never an email — this app is only used
 * in-game. Supabase Auth still requires an email, so we derive a stable
 * synthetic one from the username. The domain is never routed; it exists only
 * to satisfy the auth provider.
 *
 * Keep this value stable after creating members: changing it breaks username login.
 */
const brandId = process.env.NEXT_PUBLIC_BRAND_ID?.trim() || "crimson";
export const MEMBER_EMAIL_DOMAIN =
  process.env.MEMBER_EMAIL_DOMAIN?.trim() || `${brandId}.local`;

if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(MEMBER_EMAIL_DOMAIN)) {
  throw new Error("MEMBER_EMAIL_DOMAIN must be a valid synthetic domain");
}

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${MEMBER_EMAIL_DOMAIN}`;
}
