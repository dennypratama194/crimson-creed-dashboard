import "server-only";

import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type Member = Tables<"members">;

/** Map of member id -> display name, for decorating rows that only carry ids. */
export async function getMemberNames(
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("id, display_name")
    .in("id", unique);

  return new Map((data ?? []).map((m) => [m.id, m.display_name]));
}

export async function getMember(id: string): Promise<Member | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}
