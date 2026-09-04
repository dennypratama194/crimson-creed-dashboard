import "server-only";

import { createClient } from "@/lib/supabase/server";

export type FivemUplink = {
  /** Base URL the relay published for itself, e.g. a tunnel hostname. */
  endpoint: string;
  /** When the relay last checked in (ISO). Stale means its machine is down. */
  updatedAt: string;
};

/**
 * Where the relay says it can be reached, or null when it has never published.
 *
 * Read through the caller's session — RLS restricts the row to Super Admin, and
 * every page that reads it is already Super-Admin-gated. Never throws: if the
 * lookup fails the caller falls back to the env-configured endpoint rather than
 * reporting the game server offline over a database hiccup.
 */
export async function getFivemUplink(): Promise<FivemUplink | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("fivem_uplink")
      .select("endpoint, updated_at")
      .eq("id", true)
      .maybeSingle();
    if (!data?.endpoint) return null;
    return { endpoint: data.endpoint, updatedAt: data.updated_at };
  } catch {
    return null;
  }
}
