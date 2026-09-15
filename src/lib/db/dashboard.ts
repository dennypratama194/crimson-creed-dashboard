import "server-only";

import type {
  AdminDashboardPayload,
  DistributionSummaryPayload,
} from "@/lib/database.types";
import type { MemberSubmissionAlert } from "@/lib/db/submissions";
import type { Notification } from "@/lib/db/notifications";
import type { Order } from "@/lib/db/orders";
import { pctDelta, type KpiTrend } from "@/lib/kpi";
import { createClient } from "@/lib/supabase/server";

/** One UTC day of the 90-day order trend; the chart slices it per range. */
export type TrendPoint = AdminDashboardPayload["orderTrend"][number];

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
  attention: AdminDashboardPayload["attention"];
  orderTrend: TrendPoint[];
  recentActivity: AdminDashboardPayload["recentActivity"];
  lowStockItems: AdminDashboardPayload["lowStockItems"];
  recentOrders: AdminDashboardPayload["recentOrders"];
};

/**
 * One round-trip: `admin_dashboard()` (migration 0056) returns every count,
 * the 90-day trend and the small row lists, Super Admin-gated inside the RPC.
 * Only the percentage deltas are derived here.
 */
export async function getAdminDashboard(): Promise<AdminDashboard> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard");
  if (error) throw error;

  const k = data.kpis;
  const companyCashPrev = Math.round((k.companyCash - k.cashNet7d) * 100) / 100;
  const activeMembersPrev = k.activeMembers - k.newActiveMembers7d;
  const completedOrdersPrev = k.completedOrders - k.completedOrders7d;

  return {
    kpis: {
      activeMembers: k.activeMembers,
      orders7d: k.orders7d,
      completedOrders: k.completedOrders,
      lowStock: k.lowStock,
      companyCash: k.companyCash,
      trends: {
        companyCash: {
          previous: companyCashPrev,
          delta: pctDelta(k.companyCash, companyCashPrev),
        },
        activeMembers: {
          previous: activeMembersPrev,
          delta: pctDelta(k.activeMembers, activeMembersPrev),
        },
        orders7d: {
          previous: k.ordersPrev7d,
          delta: pctDelta(k.orders7d, k.ordersPrev7d),
        },
        completedOrders: {
          previous: completedOrdersPrev,
          delta: pctDelta(k.completedOrders, completedOrdersPrev),
        },
      },
    },
    attention: data.attention,
    orderTrend: data.orderTrend,
    recentActivity: data.recentActivity,
    lowStockItems: data.lowStockItems,
    recentOrders: data.recentOrders,
  };
}

export type MemberDashboard = {
  counts: { open: number; completed: number; unread: number };
  trends: { completedOrders: KpiTrend };
  distribution: DistributionSummaryPayload;
  submissionAlert: MemberSubmissionAlert;
  /** Closed months owing a confirmed submission — ordering is locked while non-empty. */
  submissionDebt: string[];
  activeOrders: Order[];
  recentOrders: Order[];
  recentNotifications: Notification[];
};

/** Raw shape of the `member_dashboard()` RPC's jsonb payload. */
type MemberDashboardPayload = {
  open: number;
  completed: number;
  completed7d: number;
  unread: number;
  distribution: DistributionSummaryPayload;
  submissionState: MemberSubmissionAlert["state"];
  periodMonth: string;
  activeOrders: Order[];
  recentOrders: Order[];
  recentNotifications: Notification[];
  submissionDebt: string[];
};

/**
 * One round-trip: `member_dashboard()` returns every count and row list in a
 * single jsonb payload. The period-over-period baseline is derived here — the
 * only piece the RPC leaves to the caller.
 */
export async function getMemberDashboard(): Promise<MemberDashboard> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("member_dashboard");
  if (error) throw error;

  const d = data as unknown as MemberDashboardPayload;
  const completedOrdersPrev = d.completed - d.completed7d;

  return {
    counts: { open: d.open, completed: d.completed, unread: d.unread },
    trends: {
      completedOrders: {
        previous: completedOrdersPrev,
        delta: pctDelta(d.completed, completedOrdersPrev),
      },
    },
    distribution: d.distribution,
    submissionAlert: {
      periodMonth: d.periodMonth,
      state: d.submissionState,
    },
    submissionDebt: [...d.submissionDebt].sort(),
    activeOrders: d.activeOrders,
    recentOrders: d.recentOrders,
    recentNotifications: d.recentNotifications,
  };
}
