"use client";

import { useId, useState, useTransition, type ReactNode } from "react";

import { ITEM_UNIT_LABEL, STOCK_TYPE_LABEL } from "@/lib/constants/labels";
import type { PriceableItem } from "@/lib/db/distribution";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setDistributionRateAction } from "@/app/(app)/admin/distribution/actions";

/**
 * Prices an item that already exists. Deliberately cannot create one: items are
 * created in exactly one place (Company stash), so a cut can never end up on a
 * duplicate item while the stock sits on the original.
 */
export function AddCutDialog({
  items,
  trigger,
}: {
  /** PRODUCT-category items that do not carry a cut yet (0070). */
  items: PriceableItem[];
  trigger: ReactNode;
}) {
  const rateId = useId();

  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = items.find((i) => i.id === itemId) ?? null;

  function reset() {
    setItemId("");
    setRate("");
    setError(null);
  }

  function submit() {
    setError(null);

    if (!itemId) {
      setError("Pick an item.");
      return;
    }
    const value = Number(rate);
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter a rate of zero or more.");
      return;
    }

    startTransition(async () => {
      const result = await setDistributionRateAction({
        itemId,
        unitRate: value,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not save the company cut.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success("Company cut set.");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to the company cut</DialogTitle>
          <DialogDescription>
            Pick an item and set what a member owes per unit drawn. To
            distribute something new, add it in Company stash first.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>Item</Label>
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger aria-label="Item">
              <SelectValue placeholder="Choose an item" />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name} — {STOCK_TYPE_LABEL[i.stock_type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Product-category items only. Ones already priced are hidden — change
            those with Edit on the list.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={rateId}>
            Company cut per{" "}
            {chosen ? ITEM_UNIT_LABEL[chosen.unit].toLowerCase() : "unit"}
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
      </DialogContent>
    </Dialog>
  );
}
