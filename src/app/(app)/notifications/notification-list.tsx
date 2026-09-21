"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  NOTIFICATION_CONFIG,
  NOTIFICATION_FALLBACK,
} from "@/lib/constants/notification-config";
import type { Tone } from "@/lib/constants/status-config";
import type { Notification } from "@/lib/db/notifications";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markNotificationRead } from "@/app/(app)/notifications/actions";

const TONE_CHIP: Record<Tone, string> = {
  gray: "bg-tone-gray-bg text-tone-gray-fg",
  brand: "bg-tone-brand-bg text-tone-brand-fg",
  success: "bg-tone-success-bg text-tone-success-fg",
  warning: "bg-tone-warning-bg text-tone-warning-fg",
  error: "bg-tone-error-bg text-tone-error-fg",
  info: "bg-tone-info-bg text-tone-info-fg",
};

function hrefFor(n: Notification, isAdmin: boolean): Route | null {
  if (!n.reference_id) return null;
  if (n.reference_type === "ORDER") {
    return (
      isAdmin ? `/admin/orders/${n.reference_id}` : `/orders/${n.reference_id}`
    ) as Route;
  }
  if (n.reference_type === "ITEM" && isAdmin) {
    return `/admin/inventory/${n.reference_id}` as Route;
  }
  return null;
}

export function NotificationList({
  notifications,
  isAdmin,
}: {
  notifications: Notification[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {notifications.map((n) => {
        const config = NOTIFICATION_CONFIG[n.type] ?? NOTIFICATION_FALLBACK;
        const Icon = config.icon;
        const href = hrefFor(n, isAdmin);
        const unread = n.read_at === null;

        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                if (unread) {
                  startTransition(async () => {
                    await markNotificationRead(n.id);
                  });
                }
                if (href) router.push(href);
              }}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                unread && "bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                  TONE_CHIP[config.tone],
                )}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className={cn("text-sm", unread && "font-medium")}>
                    {n.title}
                  </span>
                  {unread ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  ) : null}
                </span>
                {n.body ? (
                  <span className="text-sm text-muted-foreground">
                    {n.body}
                  </span>
                ) : null}
              </span>
              <time
                dateTime={n.created_at}
                className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-xs text-muted-foreground tabular-nums"
              >
                <span>{formatDate(n.created_at)}</span>
                <span>{formatTime(n.created_at)}</span>
              </time>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
