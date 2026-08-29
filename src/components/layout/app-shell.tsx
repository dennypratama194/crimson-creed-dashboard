"use client";

import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { AppRole } from "@/lib/constants/enums";
import { navFor } from "@/lib/constants/nav";
import { Brand } from "@/components/layout/brand";
import { NotificationBell } from "@/components/layout/notification-bell";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AppShell({
  role,
  displayName,
  unreadCount,
  children,
}: {
  role: AppRole;
  displayName: string;
  unreadCount: number;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sections = navFor(role);

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar — pinned while the main column scrolls */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 shrink-0 items-center px-5">
          <Brand />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav sections={sections} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="px-2 pb-2">
                <Brand />
              </div>
              <div className="overflow-y-auto">
                <SidebarNav
                  sections={sections}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          <NotificationBell initialCount={unreadCount} />
          <ThemeToggle />
          <UserMenu displayName={displayName} role={role} />
        </header>

        <main className="mx-auto w-full max-w-[1536px] flex-1 overflow-x-clip px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
