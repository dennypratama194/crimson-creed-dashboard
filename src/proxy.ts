import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { routeDecision } from "@/lib/auth/route-guard";
import { publicEnv } from "@/lib/env";
import {
  REMEMBER_COOKIE,
  readRememberPreference,
  withRememberPreference,
} from "@/lib/supabase/session-cookies";

/**
 * Runs before every matched request (Next 16 `proxy`, nodejs runtime):
 *  - refreshes the Supabase session and writes rotated cookies to the response
 *  - sends signed-out users to /login
 *  - sends signed-in users away from /login
 *
 * The INACTIVE-member gate and role checks live in the (app) layout / server
 * actions / RLS — this file only handles the signed-in/out boundary (see
 * src/lib/auth/route-guard.ts for why /account-unavailable is not public).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          const remember = readRememberPreference(
            request.cookies.get(REMEMBER_COOKIE)?.value,
          );
          const adjusted = withRememberPreference(cookiesToSet, remember);
          for (const { name, value } of adjusted) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of adjusted) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() verifies the JWT locally (no round trip) when the project uses
  // asymmetric signing keys, and falls back to a network check otherwise. It
  // still refreshes an expired session. The real authorization gate is the
  // (app) layout + server actions + RLS — here we only need the signed-in /
  // signed-out boundary, so a local check is enough.
  const { data: claims } = await supabase.auth.getClaims();
  const decision = routeDecision(!!claims?.claims, request.nextUrl.pathname);

  if (decision.action === "next") return response;

  const url = request.nextUrl.clone();
  url.pathname = decision.pathname;
  url.search = "";
  if (decision.next) url.searchParams.set("next", decision.next);

  // A refresh (or a cleared, expired session) may have just rewritten the auth
  // cookies onto `response`. A bare redirect would drop them, and the browser
  // would come back with the stale token.
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
