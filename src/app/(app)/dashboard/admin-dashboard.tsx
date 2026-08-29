import type { Route } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  TriangleAlert,
  Users,
} from "lucide-react";

import { ACTIVITY_TONE } from "@/lib/constants/activity-config";
import { TONE_DOT } from "@/lib/constants/status-config";
import type { AdminDashboard } from "@/lib/db/dashboard";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminOrdersTable } from "@/app/(app)/admin/orders/admin-orders-table";
import { OrdersTrendChart } from "@/app/(app)/dashboard/orders-trend-chart";

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href as Route}
      className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function AttentionRow({
  label,
  description,
  count,
  href,
}: {
  label: string;
  description: string;
  count: number;
  href: string;
}) {
  return (
    <Link
      href={href as Route}
      className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="truncate text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums",
          count > 0
            ? "bg-tone-warning-bg text-tone-warning-fg"
            : "text-muted-foreground",
        )}
      >
        {count}
      </span>
    </Link>
  );
}

export function AdminDashboardView({ data }: { data: AdminDashboard }) {
  const {
    kpis,
    attention,
    orderTrend,
    recentActivity,
    lowStockItems,
    recentOrders,
  } = data;

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
          hint={
            kpis.lowStock > 0 ? "At or below threshold" : "All above threshold"
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 lg:col-span-2">
          <OrdersTrendChart data={orderTrend} className="flex-1" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <AttentionRow
              label="Payments to verify"
              description="Submitted payments awaiting review"
              count={attention.paymentsToVerify}
              href="/admin/orders?payment=PAYMENT_SUBMITTED"
            />
            <AttentionRow
              label="Orders to process"
              description="Pending orders not yet started"
              count={attention.toProcess}
              href="/admin/orders?status=PENDING"
            />
            <AttentionRow
              label="Ready to distribute"
              description="Paid orders waiting on handover"
              count={attention.toDistribute}
              href="/admin/orders?status=PROCESSING&payment=PAID"
            />
            <AttentionRow
              label="Production to review"
              description="Member-logged production awaiting approval"
              count={attention.productionToReview}
              href="/admin/production/logs?status=PENDING"
            />
            <AttentionRow
              label="Payroll runs to finalize"
              description="Draft runs not yet finalized or paid"
              count={attention.draftPayrollRuns}
              href="/admin/payroll"
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <SectionLink href="/admin/activity">View all</SectionLink>
          </CardHeader>
          <CardContent className="pt-2">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentActivity.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        TONE_DOT[ACTIVITY_TONE[entry.verb] ?? "gray"],
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {entry.summary}
                    </span>
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

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Low stock</CardTitle>
            <SectionLink href="/admin/inventory">View all</SectionLink>
          </CardHeader>
          <CardContent className="pt-3">
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every item is above its threshold.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {lowStockItems.map((item) => {
                  const out = item.current_quantity <= 0;
                  const threshold = item.low_stock_threshold;
                  const pct =
                    threshold > 0
                      ? Math.max(
                          0,
                          Math.min(
                            100,
                            (item.current_quantity / threshold) * 100,
                          ),
                        )
                      : out
                        ? 0
                        : 100;
                  return (
                    <li key={item.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          href={`/admin/inventory/${item.id}` as Route}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {item.name}
                        </Link>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              out
                                ? "text-tone-error-fg"
                                : "text-tone-warning-fg",
                            )}
                          >
                            {formatQuantity(item.current_quantity)}
                          </span>
                          <Badge tone={out ? "error" : "warning"}>
                            {out ? "Out" : "Low"}
                          </Badge>
                        </div>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            out ? "bg-tone-error-fg" : "bg-tone-warning-fg",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {threshold > 0
                          ? `Threshold ${threshold}`
                          : "No threshold set"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Recent orders
          </h2>
          <SectionLink href="/admin/orders">View all</SectionLink>
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
