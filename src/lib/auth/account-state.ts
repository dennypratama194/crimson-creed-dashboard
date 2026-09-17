import type { MemberStatus } from "@/lib/constants/enums";

/**
 * What a request's session amounts to, in the order the guards care about.
 * Pure, so the four cases are testable without a Supabase client.
 */
export type AccountState<M> =
  | { kind: "signed-out" }
  | { kind: "no-member" }
  | { kind: "inactive"; member: M }
  | { kind: "active"; member: M };

const ACTIVE: MemberStatus = "ACTIVE";

export function accountState<M extends { status: MemberStatus }>(
  signedIn: boolean,
  member: M | null,
): AccountState<M> {
  if (!signedIn) return { kind: "signed-out" };
  if (!member) return { kind: "no-member" };
  if (member.status !== ACTIVE) return { kind: "inactive", member };
  return { kind: "active", member };
}
