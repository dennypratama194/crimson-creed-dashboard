"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ITEM_CATEGORIES } from "@/lib/constants/enums";
import { ITEM_CATEGORY_LABEL } from "@/lib/constants/labels";
import { UrlSearchField } from "@/components/patterns/url-search-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const SORT_OPTIONS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "price_desc", label: "Price (high → low)" },
  { value: "price_asc", label: "Price (low → high)" },
  { value: "recent", label: "Recently added" },
];

export function ItemsFilterBar() {
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
      <UrlSearchField placeholder="Search name or code…" label="Search items" />

      <Select
        value={params.get("category") ?? "all"}
        onValueChange={(v) => setParam("category", v, "all")}
      >
        <SelectTrigger className="sm:w-44" aria-label="Filter by category">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {ITEM_CATEGORIES.map((c) => (
            <SelectItem key={c} value={c}>
              {ITEM_CATEGORY_LABEL[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.get("status") ?? "all"}
        onValueChange={(v) => setParam("status", v, "all")}
      >
        <SelectTrigger className="sm:w-40" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.get("sort") ?? "name"}
        onValueChange={(v) => setParam("sort", v, "name")}
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
