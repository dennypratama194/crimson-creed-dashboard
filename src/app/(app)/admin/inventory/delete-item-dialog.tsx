"use client";

import { useId, useState, useTransition, type ReactNode } from "react";

import type { ItemDeleteImpact } from "@/lib/db/contracts";
import { formatQuantity } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteItemAction,
  getItemDeleteImpactAction,
} from "@/app/(app)/admin/items/actions";

/**
 * Permanent delete, kept deliberately harder than Archive.
 *
 * Archive is the reversible one and lives in its own button beside this. This
 * dialog exists because the two are NOT interchangeable and the old shared
 * ConfirmDialog made them look it: one paragraph, one red button, done.
 *
 * What it adds:
 *   * the counts of what is about to be destroyed, fetched when the dialog
 *     opens (advisory — the server re-checks everything under a row lock);
 *   * the blockers spelled out BEFORE the operator commits, rather than as an
 *     error afterwards;
 *   * typing the item name, so this cannot be a mis-click;
 *   * a disabled button while the request is in flight, so it cannot be sent
 *     twice.
 *
 * None of it is a security boundary. delete_item is Super-Admin-gated in the
 * RPC and the server action re-checks; this only stops honest mistakes.
 */
export function DeleteItemDialog({
  itemId,
  itemName,
  trigger,
}: {
  itemId: string;
  itemName: string;
  trigger: ReactNode;
}) {
  const confirmId = useId();

  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<ItemDeleteImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Fetched when the dialog opens, not on every render of the row. */
  function loadImpact() {
    setLoading(true);
    setImpact(null);
    setError(null);
    getItemDeleteImpactAction(itemId)
      .then((result) => {
        if (result.ok) setImpact(result.impact);
        else setError(result.error);
      })
      .finally(() => setLoading(false));
  }

  const blocked = impact
    ? [
        impact.blockers.orderLines > 0
          ? `${impact.blockers.orderLines} order line${impact.blockers.orderLines === 1 ? "" : "s"}`
          : null,
        impact.blockers.draws > 0
          ? `${impact.blockers.draws} draw${impact.blockers.draws === 1 ? "" : "s"}`
          : null,
        impact.blockers.submissionMaterial > 0
          ? "a monthly submission material"
          : null,
      ].filter((x): x is string => x !== null)
    : [];

  const nameMatches = typed.trim() === itemName;
  const canDelete = !loading && blocked.length === 0 && nameMatches && !pending;

  function reset() {
    setTyped("");
    setError(null);
    setImpact(null);
  }

  function submit() {
    if (!canDelete) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteItemAction(itemId);
      if (!result.ok) {
        const message = result.error ?? "Could not delete the item.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success(`"${itemName}" deleted.`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) loadImpact();
        else reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Permanently delete “{itemName}”?</DialogTitle>
          <DialogDescription>
            This is not Archive. Archiving hides an item and keeps every record
            pointing at it; this destroys the item and its stash history, and it
            cannot be undone from inside the app.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : null}

        {!loading && impact && blocked.length > 0 ? (
          <div className="rounded-md border border-tone-warning-border bg-tone-warning-bg px-3 py-2 text-sm text-tone-warning-fg">
            <p className="font-medium">This item cannot be deleted.</p>
            <p className="pt-1">
              It is on {blocked.join(" and ")}. Those records are permanent —
              settling, reversing or cancelling them does not release the item.
              Archive it instead.
            </p>
          </div>
        ) : null}

        {!loading && impact && blocked.length === 0 ? (
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <p className="font-medium">What goes with it</p>
              <ul className="pt-1 text-muted-foreground">
                <li>
                  {formatQuantity(impact.clears.onHand)} on hand, and{" "}
                  {impact.clears.stockMovements} stock movement
                  {impact.clears.stockMovements === 1 ? "" : "s"}
                </li>
                <li>
                  {impact.clears.productionAssignments} production assignment
                  {impact.clears.productionAssignments === 1 ? "" : "s"}
                </li>
                <li>
                  {impact.clears.supplierListings} supplier listing
                  {impact.clears.supplierListings === 1 ? "" : "s"}
                  {impact.clears.distributionRate > 0
                    ? ", and its company cut"
                    : ""}
                </li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              The audit log keeps a record that this happened and how much was
              destroyed. That is a record, not a backup — getting any of it back
              means restoring the database.
            </p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={confirmId}>
                Type <span className="font-medium">{itemName}</span> to confirm
              </Label>
              <Input
                id={confirmId}
                value={typed}
                autoComplete="off"
                onChange={(e) => setTyped(e.target.value)}
                placeholder={itemName}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" disabled={!canDelete} onClick={submit}>
            {pending ? "Working…" : "Delete forever"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
