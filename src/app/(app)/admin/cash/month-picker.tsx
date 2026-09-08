"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { MonthPicker as MonthPickerField } from "@/components/ui/month-picker";

/**
 * Drives the `?month=YYYY-MM` param behind the summary KPIs. Clearing it or
 * picking the current month drops the param (current month is the default).
 */
export function MonthPicker({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <MonthPickerField
      aria-label="Summary month"
      className="w-[10.5rem]"
      value={value}
      max={max}
      onChange={(v) => {
        const next = new URLSearchParams(params);
        if (!v || v === max) next.delete("month");
        else next.set("month", v);
        router.replace(`${pathname}?${next.toString()}` as Route);
      }}
    />
  );
}
