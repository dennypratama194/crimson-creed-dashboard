import "server-only";

import type { Tables } from "@/lib/database.types";
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
  const page = Math.max(1, options.page ?? 1);
  const pageSize = NOTIFICATION_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (options.unreadOnly) query = query.is("read_at", null);

  const [{ data, error, count }, unread] = await Promise.all([
    query.range(offset, offset + pageSize - 1),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
  ]);
  if (error) throw error;

  return {
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
    unreadCount: unread.count ?? 0,
  };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}
