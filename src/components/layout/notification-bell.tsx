"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/** Keep a left-open, visible tab's badge roughly current without a socket. */
export const POLL_MS = 60_000;
/**
 * Minimum gap between routine refreshes. Focus, becoming visible and a client
 * navigation often fire together; within this gap they collapse into none.
 */
export const MIN_REFRESH_GAP_MS = 15_000;

/**
 * `initialCount` is the server's count from the (app) layout, or null when the
 * layout could not read it. A known count is used as-is — no request on mount.
 * When the layout re-renders (a Server Action that revalidates, e.g. mark read)
 * the new count replaces the badge directly, keyed on `countedAt` so an
 * unchanged number still overrides a newer polled one.
 *
 * Requests: at most one in flight; skipped while the tab is hidden; aborted on
 * unmount. A failed request keeps the last known count rather than clearing it.
 */
export function NotificationBell({
  initialCount,
  countedAt,
}: {
  initialCount: number | null;
  /** When the server read `initialCount`; a new value means a fresh render. */
  countedAt: number;
}) {
  const [count, setCount] = useState<number | null>(initialCount);
  const [seenCountedAt, setSeenCountedAt] = useState(countedAt);
  if (countedAt !== seenCountedAt) {
    setSeenCountedAt(countedAt);
    if (initialCount !== null) setCount(initialCount);
  }

  const pathname = usePathname();
  const refreshRef = useRef<(() => void) | null>(null);
  // Last time the count was known to be fresh: now, if the server supplied it.
  const freshAtRef = useRef<number | null>(null);
  const hasInitialRef = useRef(initialCount !== null);

  useEffect(() => {
    if (initialCount !== null) freshAtRef.current = Date.now();
  }, [initialCount, countedAt]);

  useEffect(() => {
    let inFlight: AbortController | null = null;
    let disposed = false;

    async function refresh() {
      if (disposed || inFlight || document.visibilityState === "hidden") {
        return;
      }
      const freshAt = freshAtRef.current;
      if (freshAt !== null && Date.now() - freshAt < MIN_REFRESH_GAP_MS) {
        return;
      }

      const controller = new AbortController();
      inFlight = controller;
      try {
        const res = await fetch("/api/notifications/unread-count", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data: { count?: unknown } = await res.json();
        if (!disposed && typeof data.count === "number") {
          freshAtRef.current = Date.now();
          setCount(data.count);
        }
      } catch {
        // Network error or abort: keep the last known count.
      } finally {
        if (inFlight === controller) inFlight = null;
      }
    }

    refreshRef.current = () => void refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    if (!hasInitialRef.current) void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      disposed = true;
      inFlight?.abort();
      refreshRef.current = null;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, []);

  // A client navigation keeps the layout (and its prop) mounted, so check
  // again — subject to the same in-flight and freshness gates.
  const firstPathRef = useRef(true);
  useEffect(() => {
    if (firstPathRef.current) {
      firstPathRef.current = false;
      return;
    }
    refreshRef.current?.();
  }, [pathname]);

  const shown = count ?? 0;

  return (
    <Button variant="ghost" size="icon" asChild aria-label="Notifications">
      <Link href="/notifications" className="relative">
        <Bell />
        {shown > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
            {shown > 99 ? "99+" : shown}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
