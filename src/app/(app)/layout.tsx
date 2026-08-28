import type { ReactNode } from "react";

import { requireActiveMember } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = await requireActiveMember();

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell role={member.role} displayName={member.display_name}>
        {children}
      </AppShell>
    </TooltipProvider>
  );
}
