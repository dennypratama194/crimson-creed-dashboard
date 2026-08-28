"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AUDIT_ACTIONS } from "@/lib/constants/enums";
import { humanizeToken } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AuditFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <Select
      value={params.get("action") ?? "all"}
      onValueChange={(value) => {
        const next = new URLSearchParams(params);
        next.delete("page");
        if (value === "all") next.delete("action");
        else next.set("action", value);
        router.replace(`${pathname}?${next.toString()}` as Route);
      }}
    >
      <SelectTrigger className="sm:w-64" aria-label="Filter by action">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All actions</SelectItem>
        {AUDIT_ACTIONS.map((action) => (
          <SelectItem key={action} value={action}>
            {humanizeToken(action)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
