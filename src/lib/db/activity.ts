import "server-only";

import type { AuditAction } from "@/lib/constants/enums";
import type { Json, Tables } from "@/lib/database.types";
import { isUuid } from "@/lib/db/ids";
import { getMemberNames } from "@/lib/db/members";
import { pageBounds } from "@/lib/db/paging";
import { createClient, type ServerClient } from "@/lib/supabase/server";

export type ActivityEntry = Tables<"activity_logs"> & {
  actor_name: string | null;
};
/**
 * An audit row as the table lists it. The before/after snapshots are left out
 * on purpose: they are the bulk of every row, and are read one entry at a time
 * when someone opens it (`getAuditDetail`).
 */
const AUDIT_SUMMARY_COLUMNS =
  "id, created_at, actor_id, action, entity_type, entity_id" as const;
export type AuditEntry = Pick<
  Tables<"audit_logs">,
  "id" | "created_at" | "actor_id" | "action" | "entity_type" | "entity_id"
> & { actor_name: string | null };

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
    .select(AUDIT_SUMMARY_COLUMNS, { count: "exact" })
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

export type AuditDetail = { oldValues: Json | null; newValues: Json | null };

/**
 * One audit entry's before/after snapshots, or null when there is no such
 * entry — including one that aged out of retention, or that RLS hides from a
 * non-admin. A failed read throws. Read-only: nothing here can change an
 * audit row (the table is append-only for every non-service role).
 */
export async function getAuditDetail(
  id: string,
  client?: ServerClient,
): Promise<AuditDetail | null> {
  if (!isUuid(id)) return null;
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("audit_logs")
    .select("old_values, new_values")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { oldValues: data.old_values, newValues: data.new_values };
}
