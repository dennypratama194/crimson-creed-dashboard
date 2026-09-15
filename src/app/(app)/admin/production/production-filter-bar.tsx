"use client";

import type { Route } from "next";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
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

  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const firstRender = useRef(true);

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

  // Debounce the search term into the URL.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (search.trim() === "") next.delete("q");
      else next.set("q", search.trim());
      commit(next);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product…"
          className="pl-9"
          aria-label="Search assignments"
        />
      </div>

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
