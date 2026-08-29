import Link from "next/link";
import { Bell, CheckCircle2, Package, Plus } from "lucide-react";

import {
  NOTIFICATION_CONFIG,
  NOTIFICATION_FALLBACK,
} from "@/lib/constants/notification-config";
import type { MemberDashboard } from "@/lib/db/dashboard";
import { formatDateTime } from "@/lib/format";
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
  const { counts, activeOrders, recentOrders, recentNotifications } = data;

  return (
    <>
      <PageHeader
        title={`Welcome, ${name}`}
        description="Your orders at a glance."
        actions={
          <Button asChild>
            <Link href="/orders/new">
              <Plus aria-hidden />
              New order
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Active orders" value={counts.open} icon={Package} />
        <KpiCard
          label="Completed orders"
          value={counts.completed}
          icon={CheckCircle2}
        />
        <KpiCard
          label="Unread notifications"
          value={counts.unread}
          icon={Bell}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div>
            <div className="flex items-center justify-between pb-3">
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
            <div className="flex items-center justify-between pb-3">
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

        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent notifications</CardTitle>
            <Link
              href="/notifications"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              All
            </Link>
          </CardHeader>
          <CardContent className="pt-3">
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
                      className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0"
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
