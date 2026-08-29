import type { CookieOptions } from "@supabase/ssr";

/**
 * "Remember me" preference cookie. Written at sign-in; read on every request by
 * the Supabase cookie handlers (proxy + server client) so session rotation keeps
 * honouring the choice.
 *
 * When the box is unticked (`"0"`), the Supabase auth cookies are downgraded to
 * session cookies — the browser drops them on close and the member is signed
 * out. When it is ticked or the preference is absent (existing sessions), the
 * library's own long-lived expiry is left untouched.
 */
export const REMEMBER_COOKIE = "cc-remember";

/** ~400 days — the longest most browsers will persist a cookie. */
export const REMEMBER_MAX_AGE = 400 * 24 * 60 * 60;

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** True unless the preference cookie explicitly opts out. */
export function readRememberPreference(
  value: string | undefined | null,
): boolean {
  return value !== "0";
}

/**
 * If `remember` is false, strip the persistent lifetime from Supabase's auth
 * cookies (`sb-*`) so they become session cookies. Every other cookie is passed
 * through unchanged.
 */
export function withRememberPreference(
  cookiesToSet: CookieToSet[],
  remember: boolean,
): CookieToSet[] {
  if (remember) return cookiesToSet;

  return cookiesToSet.map((cookie) => {
    if (!cookie.name.startsWith("sb-")) return cookie;
    const options: CookieOptions = { ...cookie.options };
    delete options.maxAge;
    delete options.expires;
    return { ...cookie, options };
  });
}
