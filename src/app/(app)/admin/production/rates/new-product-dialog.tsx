"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import { ITEM_UNITS, type ItemUnit } from "@/lib/constants/enums";
import { ITEM_UNIT_LABEL } from "@/lib/constants/labels";
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
import { createProductionProductAction } from "@/app/(app)/admin/production/actions";

export function NewProductDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter();
  const nameId = useId();
  const rateId = useId();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<ItemUnit>("GRAM");
  const [rate, setRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setUnit("GRAM");
    setRate("");
    setError(null);
  }

  function submit() {
    setError(null);
    if (name.trim() === "") {
      setError("Enter a product name.");
      return;
    }
    const n = Number(rate);
    if (!Number.isFinite(n) || n < 0) {
      setError("Enter a pay rate of zero or more.");
      return;
    }

    startTransition(async () => {
      const result = await createProductionProductAction({
        name: name.trim(),
        unit,
        unitRate: n,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not create the product.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success(`Added "${name.trim()}".`);
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
          <DialogTitle>New production product</DialogTitle>
          <DialogDescription>
            Creates a PRODUCT item with this pay rate. Price and whether members
            can order it are managed later on the Items page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Processed Cocaine"
            maxLength={80}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Unit</Label>
          <Select value={unit} onValueChange={(v) => setUnit(v as ItemUnit)}>
            <SelectTrigger aria-label="Unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {ITEM_UNIT_LABEL[u]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={rateId}>
            Pay rate per {ITEM_UNIT_LABEL[unit].toLowerCase()}
          </Label>
          <Input
            id={rateId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
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
            {pending ? "Adding…" : "Add product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
