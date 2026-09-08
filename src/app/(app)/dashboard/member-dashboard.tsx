import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Lock,
  Package,
  Plus,
  Recycle,
  Wallet,
} from "lucide-react";

import {
  NOTIFICATION_CONFIG,
  NOTIFICATION_FALLBACK,
} from "@/lib/constants/notification-config";
import type { MemberDashboard } from "@/lib/db/dashboard";
import {
  formatDateTime,
  formatMonth,
  formatMoney,
  formatQuantity,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrdersTable } from "@/app/(app)/orders/orders-table";

export function MemberDashboardView({
  data,
  name,
}: {
  data: MemberDashboard;
  name: string;
}) {
  const {
    counts,
    trends,
    earnings,
    submissionAlert,
    submissionDebt,
    activeOrders,
    recentOrders,
    recentNotifications,
  } = data;
  const awaitingPayout = earnings.pendingAmount + earnings.approvedUnpaidAmount;

  const submissionMonth = formatMonth(submissionAlert.periodMonth);
  const submissionNag =
    submissionAlert.state === "MISSING"
      ? {
          tone: "warning" as const,
          text: `Your material submission for ${submissionMonth} is due.`,
        }
      : submissionAlert.state === "PENDING"
        ? {
            tone: "info" as const,
            text: `Your ${submissionMonth} material submission is awaiting review.`,
          }
        : submissionAlert.state === "REJECTED"
          ? {
              tone: "error" as const,
              text: `Your ${submissionMonth} material submission was rejected — please resubmit.`,
            }
          : null;

  return (
    <>
      <PageHeader
        title={`Welcome, ${name}`}
        description="Your orders at a glance."
        className="pb-4"
        actions={
          <Button asChild>
            <Link href="/orders/new">
              <Plus aria-hidden />
              New order
            </Link>
          </Button>
        }
      />

      {submissionDebt.length > 0 ? (
        <Link
          href="/submissions"
          className="mb-4 flex items-center gap-3 rounded-lg border border-l-4 border-l-tone-error-fg bg-tone-error-bg/40 px-4 py-3 text-sm transition-colors hover:bg-tone-error-bg/60"
        >
          <Lock className="size-4 shrink-0 text-tone-error-fg" aria-hidden />
          <span className="flex-1 font-medium">
            Ordering is locked — {submissionDebt.length} earlier{" "}
            {submissionDebt.length === 1 ? "month" : "months"} still need a
            confirmed material submission.
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </Link>
      ) : null}

      {submissionNag ? (
        <Link
          href="/submissions"
          className={cn(
            "mb-4 flex items-center gap-3 rounded-lg border border-l-4 px-4 py-3 text-sm transition-colors",
            submissionNag.tone === "warning" &&
              "border-l-tone-warning-fg bg-tone-warning-bg/40 hover:bg-tone-warning-bg/60",
            submissionNag.tone === "info" &&
              "border-l-tone-info-fg bg-tone-info-bg/40 hover:bg-tone-info-bg/60",
            submissionNag.tone === "error" &&
              "border-l-tone-error-fg bg-tone-error-bg/40 hover:bg-tone-error-bg/60",
          )}
        >
          <Recycle
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="flex-1 font-medium">{submissionNag.text}</span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Active orders" value={counts.open} icon={Package} />
        <KpiCard
          label="Completed orders"
          value={counts.completed}
          icon={CheckCircle2}
          delta={trends.completedOrders.delta}
          comparison={`vs. ${formatQuantity(trends.completedOrders.previous)} last period`}
        />
        <KpiCard
          label="Production pay pending"
          value={formatMoney(awaitingPayout)}
          icon={Wallet}
          hint="Awaiting review or payout"
        />
        <KpiCard
          label="Unread notifications"
          value={counts.unread}
          icon={Bell}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <div>
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-lg font-semibold tracking-tight">
                Active orders
              </h2>
              <Link
                href="/orders?scope=open"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            </div>
            {activeOrders.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No active orders"
                description="Everything is settled."
              />
            ) : (
              <OrdersTable rows={activeOrders} />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-lg font-semibold tracking-tight">
                Recent orders
              </h2>
              <Link
                href="/orders"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <EmptyState title="No orders yet" />
            ) : (
              <OrdersTable rows={recentOrders} />
            )}
          </div>
        </div>

        <Card className="h-fit min-w-0">
          <CardHeader className="flex-row items-center justify-between p-4 pb-0">
            <CardTitle>Recent notifications</CardTitle>
            <Link
              href="/notifications"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              All
            </Link>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {recentNotifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentNotifications.map((n) => {
                  const config =
                    NOTIFICATION_CONFIG[n.type] ?? NOTIFICATION_FALLBACK;
                  const Icon = config.icon;
                  return (
                    <li
                      key={n.id}
                      className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0"
                    >
                      <Icon
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm">{n.title}</span>
                        <time
                          dateTime={n.created_at}
                          className="text-xs text-muted-foreground tabular-nums"
                        >
                          {formatDateTime(n.created_at)}
                        </time>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
