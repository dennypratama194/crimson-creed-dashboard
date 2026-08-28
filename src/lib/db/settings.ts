import "server-only";

import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type OrganizationSettings = Tables<"organization_settings">;

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  return (
    data ?? {
      id: true,
      org_name: "Crimson Creed",
      logo_url: null,
      updated_at: new Date().toISOString(),
      updated_by: null,
    }
  );
}
