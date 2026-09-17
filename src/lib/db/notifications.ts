import "server-only";

import type { Tables } from "@/lib/database.types";
import { pageBounds } from "@/lib/db/paging";
import { createClient } from "@/lib/supabase/server";

export type Notification = Tables<"notifications">;

export const NOTIFICATION_PAGE_SIZE = 20;

export async function listNotifications(options: {
  page?: number;
  unreadOnly?: boolean;
}): Promise<{
  rows: Notification[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
}> {
  const supabase = await createClient();
  const pageSize = NOTIFICATION_PAGE_SIZE;
  const { page, from, to } = pageBounds(options.page, pageSize);

  // Fan-out writes one row per admin in one statement, so created_at ties are
  // routine; `id` keeps paging stable across them.
  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (options.unreadOnly) query = query.is("read_at", null);

  const [{ data, error, count }, unread] = await Promise.all([
    query.range(from, to),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  if (error) throw error;
  if (unread.error) throw unread.error;

  return {
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    unreadCount: unread.count ?? 0,
  };
}

/**
 * The caller's unread count (RLS scopes `notifications` to the recipient).
 * Throws on failure: a zero here would clear the badge during an outage.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}
