"use client";

import type { Route } from "next";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
