"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import { ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import type { ItemUnit } from "@/lib/constants/enums";
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
import { setProductionRateAction } from "@/app/(app)/admin/production/actions";

export function SetRateDialog({
  itemId,
  itemName,
  unit,
  currentRate,
  trigger,
}: {
  itemId: string;
  itemName: string;
  unit: ItemUnit;
  currentRate: number | null;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const rateId = useId();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(
    currentRate === null ? "" : String(currentRate),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError("Enter a pay rate of zero or more.");
      return;
    }

    startTransition(async () => {
      const result = await setProductionRateAction({ itemId, unitRate: n });
      if (!result.ok) {
        const message = result.error ?? "Could not save the pay rate.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success(`Pay rate saved for ${itemName}.`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setValue(currentRate === null ? "" : String(currentRate));
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pay rate — {itemName}</DialogTitle>
          <DialogDescription>
            Amount paid per {ITEM_UNIT_LABEL[unit].toLowerCase()} processed.
            Existing logs keep the rate they were submitted at.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={rateId}>
            Rate per {ITEM_UNIT_LABEL[unit].toLowerCase()}
          </Label>
          <Input
            id={rateId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 12.50"
          />
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
            {pending ? "Saving…" : "Save rate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
