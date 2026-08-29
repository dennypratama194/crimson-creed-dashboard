import "server-only";

import { getRecentActivity, type ActivityEntry } from "@/lib/db/activity";
import { listInventory, type InventoryLine } from "@/lib/db/inventory";
import {
  getRecentNotifications,
  getUnreadNotificationCount,
  type Notification,
} from "@/lib/db/notifications";
import {
  getMemberOrderSummary,
  getOrdersNeedingAttention,
  listAdminOrders,
  listOrders,
  type AdminOrderRow,
  type Order,
} from "@/lib/db/orders";
import { createClient } from "@/lib/supabase/server";

function startOfWeekIso(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff),
  );
  return monday.toISOString();
}

const TREND_DAYS = 14;

/** UTC midnight `n` days before today. */
function utcDaysAgo(n: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n),
  );
}

export type TrendPoint = { date: string; count: number };

/** Buckets order timestamps into one entry per day for the last TREND_DAYS. */
function bucketByDay(rows: { created_at: string }[]): TrendPoint[] {
  const buckets = new Map<string, number>();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    buckets.set(utcDaysAgo(i).toISOString().slice(0, 10), 0);
  }
  for (const row of rows) {
    const key = row.created_at.slice(0, 10);
    const current = buckets.get(key);
    if (current !== undefined) buckets.set(key, current + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export type AdminDashboard = {
  kpis: {
    activeMembers: number;
    ordersThisWeek: number;
    completedOrders: number;
    lowStock: number;
  };
  attention: {
    paymentsToVerify: number;
    toProcess: number;
    toDistribute: number;
  };
  orderTrend: TrendPoint[];
  recentActivity: ActivityEntry[];
  lowStockItems: InventoryLine[];
  recentOrders: AdminOrderRow[];
};

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const supabase = await createClient();

  const [
    activeMembers,
    ordersThisWeek,
    completedOrders,
    trendRows,
    attention,
    recentActivity,
    inventory,
    recent,
  ] = await Promise.all([
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfWeekIso()),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "COMPLETED"),
    supabase
      .from("orders")
      .select("created_at")
      .gte("created_at", utcDaysAgo(TREND_DAYS - 1).toISOString())
      .order("created_at", { ascending: true }),
    getOrdersNeedingAttention(),
    getRecentActivity(8),
    listInventory({ lowStockOnly: true, page: 1 }),
    listAdminOrders({ page: 1 }),
  ]);

  return {
    kpis: {
      activeMembers: activeMembers.count ?? 0,
      ordersThisWeek: ordersThisWeek.count ?? 0,
      completedOrders: completedOrders.count ?? 0,
      lowStock: inventory.lowStockCount,
    },
    attention,
    orderTrend: bucketByDay(trendRows.data ?? []),
    recentActivity,
    lowStockItems: inventory.rows.slice(0, 6),
    recentOrders: recent.rows.slice(0, 6),
  };
}

export type MemberDashboard = {
  counts: { open: number; completed: number; unread: number };
  activeOrders: Order[];
  recentOrders: Order[];
  recentNotifications: Notification[];
};

export async function getMemberDashboard(): Promise<MemberDashboard> {
  const [summary, unread, active, recent, notifications] = await Promise.all([
    getMemberOrderSummary(),
    getUnreadNotificationCount(),
    listOrders({ scope: "open", page: 1 }),
    listOrders({ page: 1 }),
    getRecentNotifications(5),
  ]);

  return {
    counts: {
      open: summary.open,
      completed: summary.completed,
      unread,
    },
    activeOrders: active.rows.slice(0, 6),
    recentOrders: recent.rows.slice(0, 6),
    recentNotifications: notifications,
  };
}
