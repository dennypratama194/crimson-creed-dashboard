"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavSection } from "@/lib/constants/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string, matchPrefix?: boolean) {
  if (pathname === href) return true;
  return Boolean(matchPrefix) && pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6" aria-label="Primary">
      {sections.map((section, i) => (
        <div key={section.heading ?? i} className="flex flex-col gap-1">
          {section.heading ? (
            <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.heading}
            </p>
          ) : null}
          {section.items.map((item) => {
            const active = isActive(pathname, item.href, item.matchPrefix);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
