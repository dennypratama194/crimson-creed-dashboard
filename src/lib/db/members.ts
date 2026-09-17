import "server-only";

import type { AppRole } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { isUuid } from "@/lib/db/ids";
import { chunk, ID_CHUNK, pageBounds, readAllRows } from "@/lib/db/paging";
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
  const pageSize = MEMBER_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

  // display_name is not unique; `id` keeps paging from repeating or skipping.
  let query = supabase
    .from("members")
    .select("*", { count: "exact" })
    .order("display_name", { ascending: true })
    .order("id", { ascending: true });

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

  const { data, error, count } = await query.range(from, to);
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
  return readAllRows((from, to) =>
    supabase
      .from("members")
      .select("id, display_name")
      .eq("status", "ACTIVE")
      .order("display_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/** Active Super Admins, for "attributed to" pickers. Ordered by display name. */
export async function listSuperAdmins(): Promise<MemberOption[]> {
  const supabase = await createClient();
  return readAllRows((from, to) =>
    supabase
      .from("members")
      .select("id, display_name")
      .eq("role", "SUPER_ADMIN")
      .eq("status", "ACTIVE")
      .order("display_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

/**
 * Map of member id -> display name, for decorating rows that only carry ids.
 * A failed lookup throws: rendering every actor as "Unknown member" would look
 * like data, not like an outage.
 */
export async function getMemberNames(
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(isUuid);
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const names = new Map<string, string>();
  for (const group of chunk(unique, ID_CHUNK)) {
    const { data, error } = await supabase
      .from("members")
      .select("id, display_name")
      .in("id", group);
    if (error) throw error;
    for (const m of data ?? []) names.set(m.id, m.display_name);
  }
  return names;
}

/** One member, or null when no such row is visible. Query failures throw. */
export async function getMember(id: string): Promise<Member | null> {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
