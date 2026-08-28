import type { Route } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  TriangleAlert,
  Users,
} from "lucide-react";

import type { AdminDashboard } from "@/lib/db/dashboard";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminOrdersTable } from "@/app/(app)/admin/orders/admin-orders-table";

function AttentionRow({
  label,
  count,
  href,
}: {
  label: string;
  count: number;
  href: string;
}) {
  return (
    <Link
      href={href as Route}
      className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/50"
    >
      <span>{label}</span>
      <span
        className={
          count > 0
            ? "rounded-full bg-tone-warning-bg px-2 py-0.5 text-xs font-semibold text-tone-warning-fg tabular-nums"
            : "text-xs text-muted-foreground tabular-nums"
        }
      >
        {count}
      </span>
    </Link>
  );
}

export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  const { kpis, attention, recentActivity, lowStockItems, recentOrders } = data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What needs your attention right now."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Active members"
          value={kpis.activeMembers}
          icon={Users}
        />
        <KpiCard
          label="Orders this week"
          value={kpis.ordersThisWeek}
          icon={ClipboardList}
        />
        <KpiCard
          label="Completed orders"
          value={kpis.completedOrders}
          icon={CheckCircle2}
        />
        <KpiCard
          label="Low-stock items"
          value={kpis.lowStock}
          icon={TriangleAlert}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 pt-3">
            <AttentionRow
              label="Payments to verify"
              count={attention.paymentsToVerify}
              href="/admin/orders?payment=PAYMENT_SUBMITTED"
            />
            <AttentionRow
              label="Orders to process"
              count={attention.toProcess}
              href="/admin/orders?status=PENDING"
            />
            <AttentionRow
              label="Ready to distribute"
              count={attention.toDistribute}
              href="/admin/orders?status=PROCESSING&payment=PAID"
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {recentActivity.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-4"
                  >
                    <span>{entry.summary}</span>
                    <time
                      dateTime={entry.created_at}
                      className="shrink-0 text-xs text-muted-foreground tabular-nums"
                    >
                      {formatDateTime(entry.created_at)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Low stock</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          {lowStockItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every item is above its threshold.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {lowStockItems.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4"
                >
                  <Link
                    href={`/admin/inventory/${item.id}` as Route}
                    className="hover:underline"
                  >
                    {item.name}
                  </Link>
                  <span className="text-muted-foreground tabular-nums">
                    {item.current_quantity} on hand
                    {item.low_stock_threshold > 0
                      ? ` · threshold ${item.low_stock_threshold}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Recent orders
          </h2>
          <Link
            href="/admin/orders"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <EmptyState title="No orders yet" />
        ) : (
          <AdminOrdersTable rows={recentOrders} />
        )}
      </div>
    </>
  );
}
