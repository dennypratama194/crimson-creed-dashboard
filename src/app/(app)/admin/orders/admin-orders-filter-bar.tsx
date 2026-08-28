"use client";

import type { Route } from "next";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  DISTRIBUTION_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "@/lib/constants/enums";
import {
  DISTRIBUTION_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants/labels";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AdminOrdersFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const first = useRef(true);

  function commit(next: URLSearchParams) {
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}` as Route);
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    commit(next);
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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-56">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order number…"
          className="pl-9"
          aria-label="Search orders"
        />
      </div>

      <Select
        value={params.get("status") ?? "all"}
        onValueChange={(v) => setParam("status", v)}
      >
        <SelectTrigger className="sm:w-44" aria-label="Order status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any order status</SelectItem>
          {ORDER_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.get("payment") ?? "all"}
        onValueChange={(v) => setParam("payment", v)}
      >
        <SelectTrigger className="sm:w-48" aria-label="Payment status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any payment status</SelectItem>
          {PAYMENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {PAYMENT_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.get("distribution") ?? "all"}
        onValueChange={(v) => setParam("distribution", v)}
      >
        <SelectTrigger className="sm:w-48" aria-label="Distribution status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any distribution status</SelectItem>
          {DISTRIBUTION_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {DISTRIBUTION_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
