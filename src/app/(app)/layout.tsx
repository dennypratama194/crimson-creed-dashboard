import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { requireActiveMember } from "@/lib/auth/session";
import { getUnreadNotificationCount } from "@/lib/db/notifications";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The unread badge for this render. Not worth failing every page over: an
 * unreadable count is null (not 0), and the bell fetches it once mounted.
 * `countedAt` marks a fresh server read, so the bell can tell a revalidated
 * layout from the one it already has.
 */
async function readUnreadBadge() {
  const count = await getUnreadNotificationCount().catch(() => null);
  return { count, countedAt: Date.now() };
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Both internally share one cached auth lookup; running them together saves a
  // sequential DB round trip on every navigation.
  const [member, badge, cookieStore] = await Promise.all([
    requireActiveMember(),
    readUnreadBadge(),
    cookies(),
  ]);
  const sidebarCollapsed = cookieStore.get("cc.sidebar")?.value === "collapsed";

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell
        role={member.role}
        displayName={member.display_name}
        unreadCount={badge.count}
        unreadCountedAt={badge.countedAt}
        defaultCollapsed={sidebarCollapsed}
      >
        {children}
      </AppShell>
    </TooltipProvider>
  );
}
