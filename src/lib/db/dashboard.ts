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
