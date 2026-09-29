import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { accountState, type AccountState } from "@/lib/auth/account-state";
import type { Tables } from "@/lib/database.types";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export type CurrentMember = Tables<"members">;

/** Where a signed-in session without a usable member row is sent. */
export const ACCOUNT_UNAVAILABLE_PATH = "/account-unavailable";

/**
 * The session's user id from a given client, or null. Reads `getClaims()`: the
 * JWT signature and expiry are verified locally against the project's cached
 * signing keys, so this costs no Supabase Auth round trip (`getUser()` made one
 * per render, action and poll). The trade-off is that a session revoked
 * elsewhere stays valid until its access token expires — the same window RLS
 * and PostgREST already honour. What this app treats as authoritative is the
 * `members` row read right after (status and role), which is checked live on
 * every request. Needs asymmetric JWT signing keys; on a symmetric-secret
 * project `getClaims()` falls back to a network check, so nothing breaks, it
 * just saves nothing.
 */
export async function getSessionUserId(
  supabase: ServerClient,
): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub || null;
}

/** The live member row for a user. Throws on a failed read (see below). */
async function readMemberRow(
  supabase: ServerClient,
  userId: string,
): Promise<CurrentMember | null> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The signed-in user's id, or null. Per-request memoized. */
export const getUser = cache(async (): Promise<{ id: string } | null> => {
  const id = await getSessionUserId(await createClient());
  return id ? { id } : null;
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
    return readMemberRow(await createClient(), user.id);
  },
);

/**
 * The Super Admin gate for a Route Handler, on the client the handler already
 * created (React does not memoize outside a render, so going through
 * `getUser()` there would build more clients). Answers with a status instead
 * of redirecting: a `fetch()` that follows a redirect to an HTML page gets a
 * 200 it cannot parse. The member row — status and role — is read live, the
 * same check `requireSuperAdmin` makes. A failed read throws.
 */
export async function authorizeSuperAdmin(
  supabase: ServerClient,
): Promise<
  { ok: true; member: CurrentMember } | { ok: false; status: 401 | 403 }
> {
  const userId = await getSessionUserId(supabase);
  if (!userId) return { ok: false, status: 401 };
  const member = await readMemberRow(supabase, userId);
  if (!member || !isSuperAdmin(member)) return { ok: false, status: 403 };
  return { ok: true, member };
}

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
