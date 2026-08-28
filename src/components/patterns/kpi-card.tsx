import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon ? <Icon className="size-4" aria-hidden /> : null}
        {label}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className="text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </Card>
  );
}
