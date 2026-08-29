"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition, type ReactNode } from "react";

import { ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import type { PayEligibleProduct } from "@/lib/db/production";
import { formatMoney } from "@/lib/format";
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
import { Textarea } from "@/components/ui/textarea";
import { submitProductionLogAction } from "@/app/(app)/production/actions";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LogWorkDialog({
  products,
  trigger,
}: {
  products: PayEligibleProduct[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const qtyId = useId();
  const dateId = useId();
  const noteId = useId();

  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayIso());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => products.find((p) => p.id === itemId) ?? null,
    [products, itemId],
  );
  const qtyNum = Number(quantity);
  const payoutPreview =
    selected && Number.isFinite(qtyNum) && qtyNum > 0
      ? selected.unit_rate * qtyNum
      : null;

  function reset() {
    setItemId("");
    setQuantity("");
    setOccurredAt(todayIso());
    setNote("");
    setError(null);
  }

  function submit() {
    setError(null);
    if (!itemId) {
      setError("Pick a product.");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }

    startTransition(async () => {
      const result = await submitProductionLogAction({
        itemId,
        quantity: qtyNum,
        occurredAt: occurredAt || null,
        note: note.trim() || null,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not log the production.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success("Production logged — a Super Admin will review it.");
      router.refresh();
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
          <DialogTitle>Log production</DialogTitle>
          <DialogDescription>
            Record what you processed. A Super Admin verifies it before it
            counts towards your pay.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>Product</Label>
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger aria-label="Product">
              <SelectValue placeholder="Choose a product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {formatMoney(p.unit_rate)}/
                  {ITEM_UNIT_LABEL[p.unit].toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={qtyId}>
            Quantity{" "}
            {selected ? (
              <span className="text-muted-foreground">
                ({ITEM_UNIT_LABEL[selected.unit].toLowerCase()})
              </span>
            ) : null}
          </Label>
          <Input
            id={qtyId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={dateId}>Date processed</Label>
          <Input
            id={dateId}
            type="date"
            max={todayIso()}
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>
            Note <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Batch from the west lab"
            maxLength={300}
          />
        </div>

        <p className="rounded-md border border-border bg-subtle px-3 py-2 text-sm">
          Estimated payout:{" "}
          <span className="font-semibold tabular-nums">
            {payoutPreview === null ? "—" : formatMoney(payoutPreview)}
          </span>
          {selected ? (
            <span className="text-muted-foreground">
              {" "}
              at {formatMoney(selected.unit_rate)} per{" "}
              {ITEM_UNIT_LABEL[selected.unit].toLowerCase()}
            </span>
          ) : null}
        </p>

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
            {pending ? "Logging…" : "Log production"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
