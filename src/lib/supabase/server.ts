import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import {
  REMEMBER_COOKIE,
  readRememberPreference,
  withRememberPreference,
} from "@/lib/supabase/session-cookies";

/**
 * Request-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers. Requests run as the signed-in user, so RLS is the final
 * authorization boundary. Create a fresh client per request — never cache one.
 */
export async function createClient() {
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
