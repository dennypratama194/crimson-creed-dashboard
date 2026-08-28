import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type CurrentMember = Tables<"members">;

/** The authenticated Supabase user (token validated), or null. Per-request memoized. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The application member row for the current user, or null. Per-request memoized. */
export const getCurrentMember = cache(
  async (): Promise<CurrentMember | null> => {
    const user = await getUser();
    if (!user) return null;

    const supabase = await createClient();
    const { data } = await supabase
      .from("members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return data ?? null;
  },
);

/**
 * Guard for any authenticated page. Redirects to /login when signed out, and
 * enforces the "INACTIVE members cannot use the app" rule (PRD §4).
 */
export async function requireActiveMember(): Promise<CurrentMember> {
  const member = await getCurrentMember();

  if (!member) redirect("/login");
  if (member.status !== "ACTIVE") redirect("/login?error=inactive");

  return member;
}

/** Guard for Super Admin-only pages. Members are bounced to their dashboard. */
export async function requireSuperAdmin(): Promise<CurrentMember> {
  const member = await requireActiveMember();
  if (member.role !== "SUPER_ADMIN") redirect("/dashboard");
  return member;
}

export function isSuperAdmin(member: CurrentMember | null): boolean {
  return member?.role === "SUPER_ADMIN" && member.status === "ACTIVE";
}
