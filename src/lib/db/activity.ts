import "server-only";

import type { AuditAction } from "@/lib/constants/enums";
import type { Tables } from "@/lib/database.types";
import { getMemberNames } from "@/lib/db/members";
import { pageBounds } from "@/lib/db/paging";
import { createClient } from "@/lib/supabase/server";

export type ActivityEntry = Tables<"activity_logs"> & {
  actor_name: string | null;
};
export type AuditEntry = Tables<"audit_logs"> & { actor_name: string | null };

export const FEED_PAGE_SIZE = 30;

async function decorate<T extends { actor_id: string | null }>(
  rows: T[],
): Promise<(T & { actor_name: string | null })[]> {
  const names = await getMemberNames(
    rows.map((r) => r.actor_id).filter((v): v is string => v !== null),
  );
  return rows.map((r) => ({
    ...r,
    actor_name: r.actor_id ? (names.get(r.actor_id) ?? null) : null,
  }));
}

export async function listActivity(options: { page?: number }): Promise<{
  rows: ActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const pageSize = FEED_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

  const { data, error, count } = await supabase
    .from("activity_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) throw error;

  return {
    rows: await decorate(data ?? []),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function listAudit(options: {
  page?: number;
  action?: AuditAction;
}): Promise<{
  rows: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const supabase = await createClient();
  const pageSize = FEED_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (options.action) query = query.eq("action", options.action);

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    rows: await decorate(data ?? []),
    total: count ?? 0,
    page,
    pageSize,
  };
}
