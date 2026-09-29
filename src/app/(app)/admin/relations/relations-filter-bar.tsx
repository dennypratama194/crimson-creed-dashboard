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

const SORT_OPTIONS = [
  { value: "recent", label: "Recently joined" },
  { value: "name", label: "Name (A–Z)" },
];

export function RelationsFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function commit(next: URLSearchParams) {
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}` as Route);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <UrlSearchField
        placeholder="Search relations…"
        label="Search relations"
      />

      <Select
        value={params.get("sort") ?? "recent"}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === "recent") next.delete("sort");
          else next.set("sort", v);
          commit(next);
        }}
      >
        <SelectTrigger className="sm:w-48" aria-label="Sort">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
