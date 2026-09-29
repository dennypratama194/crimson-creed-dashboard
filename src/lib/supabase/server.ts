import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import {
  REMEMBER_COOKIE,
  readRememberPreference,
  withRememberPreference,
} from "@/lib/supabase/session-cookies";

/**
 * A fresh Supabase client bound to the current request's cookies. Requests run
 * as the signed-in user, so RLS is the final authorization boundary.
 *
 * Use this directly in a Route Handler, and pass the one client it returns to
 * every helper that takes one: React's request memoization (below) does not
 * apply outside a Server Component render, so calling `createClient()` there
 * several times builds several clients.
 */
export async function createRequestClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            const remember = readRememberPreference(
              cookieStore.get(REMEMBER_COOKIE)?.value,
            );
            for (const { name, value, options } of withRememberPreference(
              cookiesToSet,
              remember,
            )) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render, where cookies are
            // read-only. The proxy refreshes the session, so this is safe
            // to ignore.
          }
        },
      },
    },
  );
}

export type ServerClient = Awaited<ReturnType<typeof createRequestClient>>;

/**
 * The request's Supabase client for Server Components, Server Actions and
 * Route Handlers.
 *
 * Inside one Server Component render this is memoized with `React.cache`: the
 * layout's auth check, the unread badge and every reader on the page share one
 * client instead of each building their own (and each separately parsing the
 * session cookies). `React.cache` is scoped to that render and discarded with
 * it — never shared between requests or users — and nothing here is kept in
 * module scope.
 *
 * Outside a render (a Server Action body, a Route Handler) React does not
 * memoize and every call returns a fresh client, exactly as before: an action
 * that rotates cookies and the render that follows it never share one.
 */
export const createClient = cache(createRequestClient);
