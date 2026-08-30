import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { requireActiveMember } from "@/lib/auth/session";
import { getUnreadNotificationCount } from "@/lib/db/notifications";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Both internally share one cached auth lookup; running them together saves a
  // sequential DB round trip on every navigation.
  const [member, unreadCount, cookieStore] = await Promise.all([
    requireActiveMember(),
    getUnreadNotificationCount(),
    cookies(),
  ]);
  const sidebarCollapsed = cookieStore.get("cc.sidebar")?.value === "collapsed";

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell
        role={member.role}
        displayName={member.display_name}
        unreadCount={unreadCount}
        defaultCollapsed={sidebarCollapsed}
      >
        {children}
      </AppShell>
    </TooltipProvider>
  );
}
