import type { Route } from "next";
import Link from "next/link";
import {
  Banknote,
  CheckCircle2,
  ClipboardList,
  TriangleAlert,
  Users,
} from "lucide-react";

import { ACTIVITY_TONE } from "@/lib/constants/activity-config";
import { TONE_DOT } from "@/lib/constants/status-config";
import type { AdminDashboard } from "@/lib/db/dashboard";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
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
      className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
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
        className="pb-4"
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <KpiCard
          label="Company cash"
          value={
            <span className={cn(kpis.companyCash < 0 && "text-tone-error-fg")}>
              {formatMoney(kpis.companyCash)}
            </span>
          }
          icon={Banknote}
          delta={kpis.trends.companyCash.delta}
          comparison={`vs. ${formatMoney(kpis.trends.companyCash.previous)} last period`}
        />
        <KpiCard
          label="Active members"
          value={kpis.activeMembers}
          icon={Users}
          delta={kpis.trends.activeMembers.delta}
          comparison={`vs. ${formatQuantity(kpis.trends.activeMembers.previous)} last period`}
        />
        <KpiCard
          label="Orders (7d)"
          value={kpis.orders7d}
          icon={ClipboardList}
          delta={kpis.trends.orders7d.delta}
          comparison={`vs. ${formatQuantity(kpis.trends.orders7d.previous)} last period`}
        />
        <KpiCard
          label="Completed orders"
          value={kpis.completedOrders}
          icon={CheckCircle2}
          delta={kpis.trends.completedOrders.delta}
          comparison={`vs. ${formatQuantity(kpis.trends.completedOrders.previous)} last period`}
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

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 lg:col-span-2">
          <OrdersTrendChart data={orderTrend} className="flex-1" />
        </div>

        <Card className="min-w-0">
          <CardHeader className="p-4 pb-0">
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
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
              label="Material submissions to review"
              description="Member monthly hand-ins awaiting confirmation"
              count={attention.submissionsToReview}
              href="/admin/submissions"
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between p-4 pb-0">
            <CardTitle>Recent activity</CardTitle>
            <SectionLink href="/admin/activity">View all</SectionLink>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentActivity.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
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

        <Card className="min-w-0">
          <CardHeader className="flex-row items-center justify-between p-4 pb-0">
            <CardTitle>Low stock</CardTitle>
            <SectionLink href="/admin/inventory">View all</SectionLink>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every item is above its threshold.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {lowStockItems.map((item) => {
                  const out = item.current_quantity <= 0;
                  const threshold = item.low_stock_threshold;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                    >
                      <Link
                        href={`/admin/inventory/${item.id}` as Route}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2 tabular-nums">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            out ? "text-tone-error-fg" : "text-tone-warning-fg",
                          )}
                        >
                          {formatQuantity(item.current_quantity)}
                        </span>
                        {threshold > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            / {threshold}
                          </span>
                        ) : null}
                        <Badge tone={out ? "error" : "warning"}>
                          {out ? "Out" : "Low"}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between pb-2">
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
