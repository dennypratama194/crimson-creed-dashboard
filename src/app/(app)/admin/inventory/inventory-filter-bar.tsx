"use client";

import type { Route } from "next";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { STOCK_TYPES } from "@/lib/constants/enums";
import { STOCK_TYPE_LABEL } from "@/lib/constants/labels";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function InventoryFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const first = useRef(true);

  function commit(next: URLSearchParams) {
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}` as Route);
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
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

  const lowOnly = params.get("low") === "1";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="pl-9"
          aria-label="Search inventory"
        />
      </div>

      <Select
        value={params.get("type") ?? "all"}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === "all") next.delete("type");
          else next.set("type", v);
          commit(next);
        }}
      >
        <SelectTrigger className="sm:w-44" aria-label="Filter by type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          {STOCK_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {STOCK_TYPE_LABEL[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={lowOnly}
          onCheckedChange={(checked) => {
            const next = new URLSearchParams(params);
            if (checked) next.set("low", "1");
            else next.delete("low");
            commit(next);
          }}
        />
        <Label className="cursor-pointer">Low stock only</Label>
      </label>
    </div>
  );
}
