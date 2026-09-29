"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { STOCK_TYPES } from "@/lib/constants/enums";
import { STOCK_TYPE_LABEL } from "@/lib/constants/labels";
import { UrlSearchField } from "@/components/patterns/url-search-field";
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

  function commit(next: URLSearchParams) {
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}` as Route);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <UrlSearchField placeholder="Search items…" label="Search inventory" />

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

      <Select
        value={params.get("status") ?? "active"}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === "active") next.delete("status");
          else next.set("status", v);
          commit(next);
        }}
      >
        <SelectTrigger className="sm:w-40" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">In the stash</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
