"use client";

import { useMemo, useState } from "react";

import type { TrendPoint } from "@/lib/db/dashboard";
import { formatDayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RANGES = [
  { short: "7D", name: "7 days", days: 7, bucket: "day" },
  { short: "14D", name: "14 days", days: 14, bucket: "day" },
  { short: "30D", name: "30 days", days: 30, bucket: "day" },
  { short: "90D", name: "90 days", days: 90, bucket: "week" },
] as const;

const DEFAULT_RANGE = "14D";

/** Sums daily points into fixed 7-day buckets, oldest first. */
export function toWeekly(points: TrendPoint[]): TrendPoint[] {
  const weeks: TrendPoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    const head = chunk[0];
    if (!head) continue;
    weeks.push({
      date: head.date,
      count: chunk.reduce((sum, p) => sum + p.count, 0),
    });
  }
  return weeks;
}

export function OrdersTrendChart({
  data,
  className,
}: {
  data: TrendPoint[];
  className?: string;
}) {
  const [rangeShort, setRangeShort] = useState(DEFAULT_RANGE);
  const [active, setActive] = useState<number | null>(null);

  const range = RANGES.find((r) => r.short === rangeShort) ?? RANGES[1];

  const points = useMemo(() => {
    const daily = data.slice(-range.days);
    return range.bucket === "week" ? toWeekly(daily) : daily;
  }, [data, range.days, range.bucket]);

  const first = points.at(0);
  const last = points.at(-1);

  const peak = Math.max(1, ...points.map((d) => d.count));
  const total = points.reduce((sum, d) => sum + d.count, 0);
  const lastIndex = points.length - 1;

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Orders placed</CardTitle>
          <p className="text-sm text-muted-foreground tabular-nums">
            {total} in the last {range.name}
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Chart date range"
          className="flex shrink-0 rounded-md border border-border p-0.5 text-xs"
        >
          {RANGES.map((r) => {
            const selected = r.short === range.short;
            return (
              <button
                key={r.short}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setActive(null);
                  setRangeShort(r.short);
                }}
                className={cn(
                  "rounded-[5px] px-2 py-1 font-medium transition-colors",
                  selected
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.short}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-4">
        {first && last ? (
          <div className="flex flex-1 flex-col">
            <div
              role="img"
              aria-label={`Orders per ${range.bucket} over the last ${range.name}. Peak ${peak}, ${total} total.`}
              className="relative flex min-h-40 flex-1 items-end gap-1"
              onPointerLeave={() => setActive(null)}
            >
              {points.map((d, i) => {
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
                          {range.bucket === "week"
                            ? `Week of ${formatDayShort(d.date)}`
                            : formatDayShort(d.date)}
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
          </div>
        ) : (
          <p className="flex flex-1 items-center justify-center py-12 text-center text-sm text-muted-foreground">
            No orders in this range.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
