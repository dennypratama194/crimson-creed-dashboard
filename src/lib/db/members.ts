import "server-only";

import type { AppRole } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import type { MemberListStatus } from "@/lib/validation/member";

export type Member = Tables<"members">;
export type MemberWithOrderCount = Member & { order_count: number };

export const MEMBER_PAGE_SIZE = 25;

export async function listMembers(options: {
  page?: number;
  search?: string;
  status?: MemberListStatus;
  role?: AppRole;
}): Promise<{
  rows: MemberWithOrderCount[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = MEMBER_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("members")
    .select("*", { count: "exact" })
    .order("display_name", { ascending: true });

  if (options.status === "active") query = query.eq("status", "ACTIVE");
  if (options.status === "inactive") query = query.eq("status", "INACTIVE");
  if (options.role) query = query.eq("role", options.role);

  const search = options.search
    ?.replace(/[,()%*]/g, " ")
    .trim()
    .slice(0, 60);
  if (search) {
    query = query.or(
      `display_name.ilike.%${search}%,username.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query.range(
    offset,
    offset + pageSize - 1,
  );
  if (error) throw error;

  const rows = data ?? [];

  // Order counts only for the members on this page, grouped in SQL by
  // `member_order_counts()` (0057) instead of pulling every order row.
  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: countRows, error: countError } = await supabase.rpc(
      "member_order_counts",
      { p_member_ids: rows.map((m) => m.id) },
    );
    if (countError) throw countError;
    for (const row of countRows ?? []) {
      counts.set(row.member_id, row.order_count);
    }
  }

  return {
    rows: rows.map((m) => ({ ...m, order_count: counts.get(m.id) ?? 0 })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export type MemberOption = { id: string; display_name: string };

/** Every active member, for assignment pickers. Ordered by display name. */
export async function listMemberOptions(): Promise<MemberOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, display_name")
    .eq("status", "ACTIVE")
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Active Super Admins, for "attributed to" pickers. Ordered by display name. */
export async function listSuperAdmins(): Promise<MemberOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, display_name")
    .eq("role", "SUPER_ADMIN")
    .eq("status", "ACTIVE")
    .order("display_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

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
