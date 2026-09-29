"use client";

import { useEffect, useState } from "react";

import type { Json } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type Detail = { oldValues: Json | null; newValues: Json | null };

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; detail: Detail };

function isDetail(value: unknown): value is Detail {
  return (
    typeof value === "object" &&
    value !== null &&
    "oldValues" in value &&
    "newValues" in value
  );
}

function JsonBlock({ label, value }: { label: string; value: Json | null }) {
  if (value == null) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase">
        {label}
      </span>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/**
 * The before/after snapshots of one audit entry. They are not part of the
 * page: they are fetched from `/api/admin/audit/[id]` the first time the
 * dialog opens, and kept for this row after that (an audit entry never
 * changes). Closing the dialog mid-load cancels the request.
 */
export function AuditDetailDialog({
  entryId,
  action,
}: {
  entryId: string;
  action: string;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "idle" });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Closing mid-load cancels the request (effect cleanup); start over
      // next time instead of showing a load that will never finish.
      if (state.status === "loading") setState({ status: "idle" });
      return;
    }
    if (state.status === "idle" || state.status === "error") {
      setState({ status: "loading" });
    }
  }

  function retry() {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }

  const loading = open && state.status === "loading";

  useEffect(() => {
    if (!loading) return;
    const controller = new AbortController();

    fetch(`/api/admin/audit/${entryId}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 404) {
          setState({ status: "missing" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const body: unknown = await res.json();
        if (!isDetail(body)) throw new Error("unexpected body");
        setState({ status: "ready", detail: body });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [loading, attempt, entryId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{action}</DialogTitle>
          <DialogDescription className="sr-only">
            What this entry recorded before and after the change.
          </DialogDescription>
        </DialogHeader>
        {state.status === "ready" ? (
          state.detail.oldValues == null && state.detail.newValues == null ? (
            <p className="text-sm text-muted-foreground">
              No before or after values were recorded for this entry.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <JsonBlock label="Before" value={state.detail.oldValues} />
              <JsonBlock label="After" value={state.detail.newValues} />
            </div>
          )
        ) : state.status === "missing" ? (
          <p className="text-sm text-muted-foreground">
            This entry is no longer available. Audit entries are kept for one
            year.
          </p>
        ) : state.status === "error" ? (
          <div className="flex flex-col items-start gap-3 text-sm">
            <p className="text-muted-foreground">
              Couldn&rsquo;t load this entry. Check your connection and try
              again.
            </p>
            <Button variant="secondary" size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2" aria-busy="true">
            <span className="sr-only">Loading…</span>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
