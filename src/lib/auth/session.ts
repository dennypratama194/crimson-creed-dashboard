import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { accountState, type AccountState } from "@/lib/auth/account-state";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type CurrentMember = Tables<"members">;

/** Where a signed-in session without a usable member row is sent. */
export const ACCOUNT_UNAVAILABLE_PATH = "/account-unavailable";

/** The authenticated Supabase user (token validated), or null. Per-request memoized. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * The application member row for the current user, or null when there is none.
 * Per-request memoized. A failed lookup THROWS: treating it as "no member"
 * would bounce a healthy account to the unavailable screen during an outage.
 */
export const getCurrentMember = cache(
  async (): Promise<CurrentMember | null> => {
    const user = await getUser();
    if (!user) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    return data;
  },
);

/** Signed out / active / inactive / signed in with no member row. */
export async function getAccountState(): Promise<AccountState<CurrentMember>> {
  const user = await getUser();
  return accountState(!!user, user ? await getCurrentMember() : null);
}

/**
 * Guard for any authenticated page. Redirects to /login when signed out, and
 * enforces the "INACTIVE members cannot use the app" rule (PRD §4).
 *
 * A session that is still valid but has no usable member — deactivated while
 * signed in, or an auth user with no member row — goes to the account
 * unavailable screen, NOT to /login: the proxy sends any valid session away
 * from /login to /dashboard, which would bring it straight back here.
 */
export async function requireActiveMember(): Promise<CurrentMember> {
  const state = await getAccountState();

  if (state.kind === "signed-out") redirect("/login");
  if (state.kind !== "active") redirect(ACCOUNT_UNAVAILABLE_PATH);

  return state.member;
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
