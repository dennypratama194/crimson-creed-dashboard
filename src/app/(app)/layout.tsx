import type { ReactNode } from "react";

import { requireActiveMember } from "@/lib/auth/session";
import { APP_ROLE_LABEL } from "@/lib/constants/labels";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Phase 2 shell. The real sidebar / navigation drawer and role-aware layout
 * arrive in Phase 3; for now this only enforces the auth + ACTIVE guard and
 * gives a minimal frame.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = await requireActiveMember();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
        <span className="text-sm font-semibold tracking-wide text-primary uppercase">
          Crimson Creed
        </span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {member.display_name} · {APP_ROLE_LABEL[member.role]}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1536px] flex-1 px-6 py-8 md:px-10">
        {children}
      </main>
    </div>
  );
}
