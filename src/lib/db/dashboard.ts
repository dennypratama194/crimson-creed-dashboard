import "server-only";

import { getRecentActivity, type ActivityEntry } from "@/lib/db/activity";
import { getCashBalance, getCashSummary } from "@/lib/db/cash";
import { listInventory, type InventoryLine } from "@/lib/db/inventory";
import { getPayrollAttention } from "@/lib/db/payroll";
import {
  getMyEarningsSummary,
  getPendingProductionCount,
  type EarningsSummary,
} from "@/lib/db/production";
import {
  getMemberSubmissionAlert,
  getSubmissionAttention,
  type MemberSubmissionAlert,
} from "@/lib/db/submissions";
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
import { pctDelta, type KpiTrend } from "@/lib/kpi";
import { createClient } from "@/lib/supabase/server";

// Widest window the dashboard chart can show. The client-side range toggle
// (7 / 14 / 30 / 90 days) slices this down, so one query covers every option.
const TREND_DAYS = 90;

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
    orders7d: number;
    completedOrders: number;
    lowStock: number;
    companyCash: number;
    /**
     * Period-over-period baselines. Every baseline is the value as of 7 days
     * ago: for `orders7d` that means the preceding 7-day window; for the
     * running totals it means the total minus what accrued in the last 7 days.
     */
    trends: {
      companyCash: KpiTrend;
      activeMembers: KpiTrend;
      orders7d: KpiTrend;
      completedOrders: KpiTrend;
    };
  };
  attention: {
    paymentsToVerify: number;
    toProcess: number;
    toDistribute: number;
    productionToReview: number;
    draftPayrollRuns: number;
    unpaidPayrollTotal: number;
    submissionsToReview: number;
    membersNotSubmitted: number;
  };
  orderTrend: TrendPoint[];
  recentActivity: ActivityEntry[];
  lowStockItems: InventoryLine[];
  recentOrders: AdminOrderRow[];
};

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const supabase = await createClient();

  // "This period" is the last 7 days; "last period" the 7 days before that.
  const periodStart = utcDaysAgo(7).toISOString();
  const prevPeriodStart = utcDaysAgo(14).toISOString();

  const [
    activeMembers,
    orders7d,
    completedOrders,
    trendRows,
    attention,
    recentActivity,
    inventory,
    recent,
    productionToReview,
    payrollAttention,
    companyCash,
    submissionAttention,
    ordersPrev7d,
    completedThisPeriod,
    newActiveThisPeriod,
    cashThisPeriod,
  ] = await Promise.all([
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE"),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", periodStart),
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
    listInventory({ page: 1 }),
    listAdminOrders({ page: 1 }),
    getPendingProductionCount(),
    getPayrollAttention(),
    getCashBalance(),
    getSubmissionAttention(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", prevPeriodStart)
      .lt("created_at", periodStart),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("completed_at", periodStart),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "ACTIVE")
      .gte("created_at", periodStart),
    getCashSummary({ from: periodStart }),
  ]);

  const activeMembersNow = activeMembers.count ?? 0;
  const orders7dNow = orders7d.count ?? 0;
  const completedOrdersNow = completedOrders.count ?? 0;

  const companyCashPrev =
    Math.round((companyCash - cashThisPeriod.net) * 100) / 100;
  const activeMembersPrev = activeMembersNow - (newActiveThisPeriod.count ?? 0);
  const completedOrdersPrev =
    completedOrdersNow - (completedThisPeriod.count ?? 0);
  const ordersPrev7dCount = ordersPrev7d.count ?? 0;

  return {
    kpis: {
      activeMembers: activeMembersNow,
      orders7d: orders7dNow,
      completedOrders: completedOrdersNow,
      lowStock: inventory.lowStockCount,
      companyCash,
      trends: {
        companyCash: {
          previous: companyCashPrev,
          delta: pctDelta(companyCash, companyCashPrev),
        },
        activeMembers: {
          previous: activeMembersPrev,
          delta: pctDelta(activeMembersNow, activeMembersPrev),
        },
        orders7d: {
          previous: ordersPrev7dCount,
          delta: pctDelta(orders7dNow, ordersPrev7dCount),
        },
        completedOrders: {
          previous: completedOrdersPrev,
          delta: pctDelta(completedOrdersNow, completedOrdersPrev),
        },
      },
    },
    attention: {
      ...attention,
      productionToReview,
      draftPayrollRuns: payrollAttention.draftRuns,
      unpaidPayrollTotal: payrollAttention.unpaidFinalizedTotal,
      submissionsToReview: submissionAttention.toReview,
      membersNotSubmitted: submissionAttention.notSubmittedThisMonth,
    },
    orderTrend: bucketByDay(trendRows.data ?? []),
    recentActivity,
    lowStockItems: inventory.rows.slice(0, 5),
    recentOrders: recent.rows.slice(0, 6),
  };
}

export type MemberDashboard = {
  counts: { open: number; completed: number; unread: number };
  trends: { completedOrders: KpiTrend };
  earnings: EarningsSummary;
  submissionAlert: MemberSubmissionAlert;
  activeOrders: Order[];
  recentOrders: Order[];
  recentNotifications: Notification[];
};

export async function getMemberDashboard(): Promise<MemberDashboard> {
  const supabase = await createClient();
  const periodStart = utcDaysAgo(7).toISOString();

  const [
    summary,
    unread,
    active,
    recent,
    notifications,
    earnings,
    completedThisPeriod,
    submissionAlert,
  ] = await Promise.all([
    getMemberOrderSummary(),
    getUnreadNotificationCount(),
    listOrders({ scope: "open", page: 1 }),
    listOrders({ page: 1 }),
    getRecentNotifications(5),
    getMyEarningsSummary(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("completed_at", periodStart),
    getMemberSubmissionAlert(),
  ]);

  const completedOrdersPrev =
    summary.completed - (completedThisPeriod.count ?? 0);

  return {
    counts: {
      open: summary.open,
      completed: summary.completed,
      unread,
    },
    trends: {
      completedOrders: {
        previous: completedOrdersPrev,
        delta: pctDelta(summary.completed, completedOrdersPrev),
      },
    },
    earnings,
    submissionAlert,
    activeOrders: active.rows.slice(0, 6),
    recentOrders: recent.rows.slice(0, 6),
    recentNotifications: notifications,
  };
}
