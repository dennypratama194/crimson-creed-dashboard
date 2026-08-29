/**
 * Members sign in with a username, never an email — this app is only used
 * in-game. Supabase Auth still requires an email, so we derive a stable
 * synthetic one from the username. The domain is never routed; it exists only
 * to satisfy the auth provider.
 *
 * Keep `MEMBER_EMAIL_DOMAIN` in sync with `DOMAIN` in `supabase/seed.ts`.
 */
export const MEMBER_EMAIL_DOMAIN = "crimson.local";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${MEMBER_EMAIL_DOMAIN}`;
}
