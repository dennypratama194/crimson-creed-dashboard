import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS entirely — use ONLY in trusted server code
 * for operations the PRD assigns to Super Admin that Supabase Auth cannot do
 * as a normal user: creating member auth users and resetting member passwords
 * (PRD §4). Never import this into a Client Component.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
