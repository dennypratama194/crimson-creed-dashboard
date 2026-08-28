"use client";

import { Bell, Menu } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import type { AppRole } from "@/lib/constants/enums";
import { navFor } from "@/lib/constants/nav";
import { Brand } from "@/components/layout/brand";
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
  children,
}: {
  role: AppRole;
  displayName: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sections = navFor(role);

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center px-5">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
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

          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label="Notifications"
          >
            <Link href="/notifications">
              <Bell />
            </Link>
          </Button>
          <ThemeToggle />
          <UserMenu displayName={displayName} role={role} />
        </header>

        <main className="mx-auto w-full max-w-[1536px] flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
