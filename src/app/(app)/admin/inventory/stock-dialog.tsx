"use client";

import { useId, useState, useTransition } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { applyStockAction } from "@/app/(app)/admin/inventory/actions";

type Kind = "add" | "remove" | "set";

const TABS: { kind: Kind; label: string }[] = [
  { kind: "add", label: "Add stock" },
  { kind: "remove", label: "Remove stock" },
  { kind: "set", label: "Set exact count" },
];

export function StockDialog({
  itemId,
  itemName,
  currentQuantity,
  trigger,
}: {
  itemId: string;
  itemName: string;
  currentQuantity: number;
  trigger: React.ReactNode;
}) {
  const qtyId = useId();
  const notesId = useId();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("add");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setKind("add");
    setValue("");
    setNotes("");
    setError(null);
  }

  function submit() {
    setError(null);
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || (kind !== "set" && n <= 0)) {
      setError("Enter a whole number.");
      return;
    }
    const input =
      kind === "set"
        ? { kind, target: n, notes }
        : { kind, quantity: n, notes };

    startTransition(async () => {
      const result = await applyStockAction(itemId, input);
      if (!result.ok) {
        const message = result.error ?? "Could not update stock.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success(`Stock updated for ${itemName}.`);
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
          <DialogTitle>Adjust stock — {itemName}</DialogTitle>
          <DialogDescription>
            On hand now: <span className="tabular-nums">{currentQuantity}</span>
            . Every change is recorded as a movement.
          </DialogDescription>
        </DialogHeader>

        <div className="inline-flex w-full rounded-lg border border-border p-0.5 text-sm">
          {TABS.map((tab) => (
            <button
              key={tab.kind}
              type="button"
              onClick={() => setKind(tab.kind)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 font-medium transition-colors",
                kind === tab.kind
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={qtyId}>
            {kind === "set" ? "New counted quantity" : "Quantity"}
          </Label>
          <Input
            id={qtyId}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={notesId}>
            Note <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Physical count correction"
            maxLength={300}
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
            {pending ? "Saving…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
