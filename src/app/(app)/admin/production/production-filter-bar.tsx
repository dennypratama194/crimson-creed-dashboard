"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { UrlSearchField } from "@/components/patterns/url-search-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SCOPE_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "unpaid", label: "Not paid" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

export function ProductionFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function commit(next: URLSearchParams) {
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}` as Route);
  }

  function setParam(key: string, value: string, clearWhen: string) {
    const next = new URLSearchParams(params);
    if (value === clearWhen) next.delete(key);
    else next.set(key, value);
    commit(next);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <UrlSearchField
        placeholder="Search product…"
        label="Search assignments"
      />

      <Select
        value={params.get("scope") ?? "all"}
        onValueChange={(v) => setParam("scope", v, "all")}
      >
        <SelectTrigger className="sm:w-44" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SCOPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
