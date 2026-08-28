import type { ReactNode } from "react";

import { requireActiveMember } from "@/lib/auth/session";
import { getUnreadNotificationCount } from "@/lib/db/notifications";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = await requireActiveMember();
  const unreadCount = await getUnreadNotificationCount();

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell
        role={member.role}
        displayName={member.display_name}
        unreadCount={unreadCount}
      >
        {children}
      </AppShell>
    </TooltipProvider>
  );
}
