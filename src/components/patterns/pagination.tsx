"use client";

import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

/** URL-driven pager. Writes `?page=` and lets the server component refetch. */
export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function go(next: number) {
    const q = new URLSearchParams(params);
    if (next <= 1) q.delete("page");
    else q.set("page", String(next));
    router.push(`${pathname}?${q.toString()}` as Route);
  }

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <p className="text-muted-foreground tabular-nums">
        {total === 0 ? "No results" : `${from}–${to} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft aria-hidden />
          Previous
        </Button>
        <span className="text-muted-foreground tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => go(page + 1)}
          disabled={page >= totalPages}
        >
          Next
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
