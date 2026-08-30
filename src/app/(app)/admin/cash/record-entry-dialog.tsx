"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition, type ReactNode } from "react";

import { cashCategoriesFor } from "@/lib/constants/cash";
import { CASH_DIRECTIONS, type CashDirection } from "@/lib/constants/enums";
import {
  CASH_CATEGORY_LABEL,
  CASH_DIRECTION_LABEL,
} from "@/lib/constants/labels";
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
import { recordCashEntryAction } from "@/app/(app)/admin/cash/actions";

type AdminOption = { id: string; display_name: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RecordEntryDialog({
  trigger,
  admins,
  defaultHandledById,
}: {
  trigger: ReactNode;
  admins: AdminOption[];
  defaultHandledById?: string;
}) {
  const router = useRouter();
  const amountId = useId();
  const dateId = useId();
  const noteId = useId();

  const firstHandler =
    defaultHandledById && admins.some((a) => a.id === defaultHandledById)
      ? defaultHandledById
      : (admins[0]?.id ?? "");

  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<CashDirection>("IN");
  const [category, setCategory] = useState<string>(cashCategoriesFor("IN")[0]);
  const [handledBy, setHandledBy] = useState(firstHandler);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const categories = useMemo(() => cashCategoriesFor(direction), [direction]);

  function reset() {
    setDirection("IN");
    setCategory(cashCategoriesFor("IN")[0]);
    setHandledBy(firstHandler);
    setAmount("");
    setDate(todayIso());
    setNote("");
    setAllowNegative(false);
    setError(null);
  }

  function changeDirection(next: CashDirection) {
    setDirection(next);
    setCategory(cashCategoriesFor(next)[0]);
  }

  function submit() {
    setError(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!handledBy) {
      setError("Choose who handled this.");
      return;
    }

    startTransition(async () => {
      const result = await recordCashEntryAction({
        direction,
        amount: n,
        category,
        handledBy,
        occurredAt: date || null,
        note: note.trim() || null,
        allowNegative,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not record the entry.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success(`${direction === "IN" ? "Income" : "Expense"} recorded.`);
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
          <DialogTitle>Record a cash entry</DialogTitle>
          <DialogDescription>
            Adjusts the company balance immediately. Corrections are made by
            reversing an entry, not editing it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <Select
            value={direction}
            onValueChange={(v) => changeDirection(v as CashDirection)}
          >
            <SelectTrigger aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CASH_DIRECTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {CASH_DIRECTION_LABEL[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {CASH_CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Handled by</Label>
          <Select value={handledBy} onValueChange={setHandledBy}>
            <SelectTrigger aria-label="Handled by">
              <SelectValue placeholder="Select a Super Admin" />
            </SelectTrigger>
            <SelectContent>
              {admins.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={amountId}>Amount</Label>
          <Input
            id={amountId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 2500"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={dateId}>Date</Label>
          <Input
            id={dateId}
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
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
            placeholder="What was this for?"
            maxLength={300}
          />
        </div>

        {direction === "OUT" ? (
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={allowNegative}
              onChange={(e) => setAllowNegative(e.target.checked)}
            />
            Allow this to take the balance below zero
          </label>
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
          <Button onClick={submit} disabled={pending}>
            {pending ? "Recording…" : "Record entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
