import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";

import { getCurrentMember } from "@/lib/auth/session";
import { listNotifications } from "@/lib/db/notifications";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { cn } from "@/lib/utils";
import { clampPage } from "@/lib/db/paging";
import { MarkAllReadButton } from "@/app/(app)/notifications/mark-all-read-button";
import { NotificationList } from "@/app/(app)/notifications/notification-list";

export const metadata: Metadata = { title: "Notifications" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function NotificationsPage({
  searchParams,
}: PageProps<"/notifications">) {
  const sp = await searchParams;
  const page = clampPage(one(sp.page));
  const unreadOnly = one(sp.filter) === "unread";

  // getCurrentMember is already in flight from the layout; list alongside it.
  const [member, { rows, total, pageSize, unreadCount }] = await Promise.all([
    getCurrentMember(),
    listNotifications({ page, unreadOnly }),
  ]);

  const tabs: { key: string; label: string; href: Route }[] = [
    { key: "all", label: "All", href: "/notifications" },
    {
      key: "unread",
      label: `Unread (${unreadCount})`,
      href: "/notifications?filter=unread",
    },
  ];
  const activeKey = unreadOnly ? "unread" : "all";

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Order, payment, distribution and stock updates."
        actions={<MarkAllReadButton disabled={unreadCount === 0} />}
      />

      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          className="inline-flex w-fit rounded-lg border border-border p-0.5 text-sm"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              role="tab"
              aria-selected={activeKey === tab.key}
              className={cn(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                activeKey === tab.key
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={unreadOnly ? "All caught up" : "No notifications"}
            description={
              unreadOnly
                ? "You have no unread notifications."
                : "Updates about your orders will show up here."
            }
          />
        ) : (
          <>
            <NotificationList
              notifications={rows}
              isAdmin={member?.role === "SUPER_ADMIN"}
            />
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
