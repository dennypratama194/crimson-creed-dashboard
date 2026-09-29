"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { ITEM_CATEGORY_LABEL } from "@/lib/constants/labels";
import type { PickerItem } from "@/lib/db/suppliers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type PickerPage = {
  rows: PickerItem[];
  total: number;
  page: number;
  pageSize: number;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: PickerPage };

function isPickerPage(value: unknown): value is PickerPage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.rows) &&
    typeof v.total === "number" &&
    typeof v.page === "number" &&
    typeof v.pageSize === "number"
  );
}

/**
 * The Add item picker. Mounted only while the add dialog is open, so the item
 * list is fetched then — never with the supplier page — one searched page at a
 * time from `/api/admin/suppliers/[id]/available-items`, which already leaves
 * out everything this supplier lists on any page of its catalogue.
 *
 * Typing does not fetch; Enter or Search does, and only when the term changed.
 * The chosen item survives paging and searching, and is posted through the
 * hidden `itemId` input of the surrounding form.
 */
export function SupplierItemPicker({
  supplierId,
  error,
}: {
  supplierId: string;
  error?: string;
}) {
  const labelId = useId();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState({ search: "", page: 1 });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selected, setSelected] = useState<PickerItem | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (query.search) params.set("q", query.search);
    if (query.page > 1) params.set("page", String(query.page));
    const qs = params.toString();

    fetch(
      `/api/admin/suppliers/${supplierId}/available-items${qs ? `?${qs}` : ""}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const body: unknown = await res.json();
        if (!isPickerPage(body)) throw new Error("unexpected body");
        setState({ status: "ready", data: body });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [supplierId, query, attempt]);

  function applySearch() {
    const search = draft.trim().replace(/\s+/g, " ");
    if (search === query.search) return;
    setState({ status: "loading" });
    setQuery({ search, page: 1 });
  }

  function goToPage(page: number) {
    setState({ status: "loading" });
    setQuery((q) => ({ ...q, page }));
  }

  function retry() {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  const data = state.status === "ready" ? state.data : null;
  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm leading-none font-medium">
        Item<span className="text-destructive"> *</span>
      </span>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Inside the line's form: Enter searches, it must not submit.
              if (e.key === "Enter") {
                e.preventDefault();
                applySearch();
              }
            }}
            placeholder="Search items…"
            className="pl-9"
            aria-label="Search items"
          />
        </div>
        <Button type="button" variant="secondary" onClick={applySearch}>
          Search
        </Button>
      </div>

      <input type="hidden" name="itemId" value={selected?.id ?? ""} />

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-busy={state.status === "loading"}
        aria-invalid={Boolean(error)}
        className="flex max-h-64 min-h-24 flex-col overflow-y-auto rounded-md border border-border"
      >
        {state.status === "loading" ? (
          <div className="flex flex-col gap-2 p-3" aria-label="Loading items">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : state.status === "error" ? (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-sm">
            <p className="text-muted-foreground">
              Couldn&rsquo;t load the item list.
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : data!.rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {query.search
              ? `No unlisted items match “${query.search}”.`
              : data!.total === 0
                ? "Every item is already listed for this supplier."
                : "Nothing on this page."}
          </p>
        ) : (
          data!.rows.map((item) => {
            const checked = selected?.id === item.id;
            return (
              <label
                key={item.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0",
                  checked && "bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="itemPick"
                  value={item.id}
                  checked={checked}
                  onChange={() => setSelected(item)}
                  className="accent-primary"
                />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {ITEM_CATEGORY_LABEL[item.category]}
                </span>
              </label>
            );
          })
        )}
      </div>

      {data && data.total > data.pageSize ? (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Page {data.page} of {totalPages} · {data.total} items
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => goToPage(data.page - 1)}
              disabled={data.page <= 1}
              aria-label="Previous items"
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => goToPage(data.page + 1)}
              disabled={data.page >= totalPages}
              aria-label="Next items"
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <p className="text-xs text-muted-foreground">
          Selected: <span className="text-foreground">{selected.name}</span>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-tone-error-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
