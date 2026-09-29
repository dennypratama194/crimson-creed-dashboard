"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
import { UrlSearchField } from "@/components/patterns/url-search-field";
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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <UrlSearchField
        placeholder="Search order number…"
        label="Search orders"
      />

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
