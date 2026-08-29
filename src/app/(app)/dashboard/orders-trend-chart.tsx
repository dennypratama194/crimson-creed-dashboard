"use client";

import { useState } from "react";

import type { TrendPoint } from "@/lib/db/dashboard";
import { formatDayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function OrdersTrendChart({ data }: { data: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);

  const first = data.at(0);
  const last = data.at(-1);
  if (!first || !last) return null;

  const peak = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const lastIndex = data.length - 1;

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Orders placed</CardTitle>
        <span className="text-sm text-muted-foreground tabular-nums">
          {total} in {data.length} days
        </span>
      </CardHeader>
      <CardContent className="pt-4">
        <div
          role="img"
          aria-label={`Orders per day over the last ${data.length} days. Peak ${peak} in a day, ${total} total.`}
          className="relative flex h-40 items-end gap-1.5"
          onPointerLeave={() => setActive(null)}
        >
          {data.map((d, i) => {
            const height =
              d.count === 0 ? 2 : Math.max((d.count / peak) * 100, 6);
            const isActive = active === i;
            const anchor =
              i <= 1
                ? "left-0"
                : i >= lastIndex - 1
                  ? "right-0"
                  : "left-1/2 -translate-x-1/2";

            return (
              <div
                key={d.date}
                className="group relative flex h-full flex-1 items-end rounded-sm transition-colors hover:bg-muted/40"
                onPointerEnter={() => setActive(i)}
              >
                <div
                  className={cn(
                    "w-full rounded-sm transition-colors",
                    isActive || i === lastIndex
                      ? "bg-primary"
                      : "bg-primary/60 group-hover:bg-primary/80",
                  )}
                  style={{ height: `${height}%` }}
                />
                {isActive ? (
                  <div
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md",
                      anchor,
                    )}
                  >
                    <div className="font-medium text-popover-foreground tabular-nums">
                      {d.count} {d.count === 1 ? "order" : "orders"}
                    </div>
                    <div className="text-muted-foreground">
                      {formatDayShort(d.date)}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatDayShort(first.date)}</span>
          <span>{formatDayShort(last.date)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
