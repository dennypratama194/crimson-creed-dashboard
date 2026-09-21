"use client";

import { useId, useState, useTransition } from "react";

import { ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import type { DistributionRateRow } from "@/lib/db/distribution";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setDistributionRateAction } from "@/app/(app)/admin/distribution/actions";

/**
 * Remounted per row (see the `key` below), so the rate field seeds itself from
 * props on mount rather than syncing through an effect.
 */
function RateForm({
  row,
  onDone,
}: {
  row: DistributionRateRow;
  onDone: () => void;
}) {
  const rateId = useId();

  const [rate, setRate] = useState(
    row.unit_rate === null ? "" : String(row.unit_rate),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);

    const value = Number(rate);
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter a rate of zero or more.");
      return;
    }

    startTransition(async () => {
      const result = await setDistributionRateAction({
        itemId: row.item_id,
        unitRate: value,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not save the company cut.";
        setError(message);
        toast.error(message);
        return;
      }
      onDone();
      toast.success("Company cut saved.");
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Company cut — {row.name}</DialogTitle>
        <DialogDescription>
          What the member owes the company per unit drawn. What they sell it for
          on the street is their own margin and is not tracked here.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={rateId}>
          Rate per {ITEM_UNIT_LABEL[row.unit].toLowerCase()}
        </Label>
        <Input
          id={rateId}
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Existing draws keep the rate they were issued at.
        </p>
      </div>

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
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Save cut"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function SetRateDialog({
  row,
  open,
  onOpenChange,
}: {
  row: DistributionRateRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {row ? (
          <RateForm
            key={row.item_id}
            row={row}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
