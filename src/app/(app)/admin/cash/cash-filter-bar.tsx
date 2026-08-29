"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  CASH_CATEGORIES,
  CASH_DIRECTIONS,
  CASH_ENTRY_SOURCES,
} from "@/lib/constants/enums";
import {
  CASH_CATEGORY_LABEL,
  CASH_DIRECTION_LABEL,
  CASH_ENTRY_SOURCE_LABEL,
} from "@/lib/constants/labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CashFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}` as Route);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select
        value={params.get("direction") ?? "all"}
        onValueChange={(v) => set("direction", v)}
      >
        <SelectTrigger className="sm:w-44" aria-label="Filter by type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {CASH_DIRECTIONS.map((d) => (
            <SelectItem key={d} value={d}>
              {CASH_DIRECTION_LABEL[d]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.get("category") ?? "all"}
        onValueChange={(v) => set("category", v)}
      >
        <SelectTrigger className="sm:w-52" aria-label="Filter by category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {CASH_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {CASH_CATEGORY_LABEL[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.get("source") ?? "all"}
        onValueChange={(v) => set("source", v)}
      >
        <SelectTrigger className="sm:w-44" aria-label="Filter by source">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {CASH_ENTRY_SOURCES.map((s) => (
            <SelectItem key={s} value={s}>
              {CASH_ENTRY_SOURCE_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
