import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { formatPercent } from "@/lib/format";
import type { KpiDelta } from "@/lib/kpi";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

const DELTA_STYLES: Record<KpiDelta["direction"], string> = {
  up: "bg-tone-success-bg text-tone-success-fg",
  down: "bg-tone-error-bg text-tone-error-fg",
  flat: "bg-tone-gray-bg text-tone-gray-fg",
};

const DELTA_ICON: Record<KpiDelta["direction"], LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

function DeltaPill({ delta }: { delta: KpiDelta }) {
  const Icon = DELTA_ICON[delta.direction];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
        DELTA_STYLES[delta.direction],
      )}
    >
      <Icon className="size-3" aria-hidden />
      {formatPercent(Math.abs(delta.pct))}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  delta,
  comparison,
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  className?: string;
  /** Period-over-period change, rendered as a coloured pill beside the value. */
  delta?: KpiDelta;
  /** Baseline caption under the value, e.g. `vs. 1,185 last period`. */
  comparison?: string;
  /** Fallback caption shown when no `comparison` is provided. */
  hint?: string;
}) {
  const caption = comparison ?? hint;

  return (
    <Card
      className={cn(
        "@container/kpi flex flex-col gap-2 overflow-hidden p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 text-[clamp(1.25rem,12cqi,1.875rem)] leading-tight font-semibold tracking-tight break-words tabular-nums">
          {value}
        </span>
        {delta ? <DeltaPill delta={delta} /> : null}
      </div>
      {caption ? (
        <div className="text-xs text-muted-foreground tabular-nums">
          {caption}
        </div>
      ) : null}
    </Card>
  );
}
