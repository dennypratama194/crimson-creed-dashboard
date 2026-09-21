"use client";

import { useId, useState, useTransition, type ReactNode } from "react";

import type { PaymentRecipient } from "@/lib/db/orders";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitPaymentAction } from "@/app/(app)/orders/actions";

export function MarkPaidDialog({
  orderId,
  recipients,
  trigger,
}: {
  orderId: string;
  recipients: PaymentRecipient[];
  trigger: ReactNode;
}) {
  const paidToId = useId();

  const [open, setOpen] = useState(false);
  const [paidTo, setPaidTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setPaidTo("");
    setError(null);
  }

  function submit() {
    setError(null);
    if (!paidTo) {
      setError("Choose who you paid.");
      return;
    }
    startTransition(async () => {
      const result = await submitPaymentAction({ orderId, paidTo });
      if (!result.ok) {
        const message = result.error ?? "Could not record your payment.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success("Payment reported — a Super Admin will verify it.");
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
          <DialogTitle>Confirm the in-game payment</DialogTitle>
          <DialogDescription>
            Only do this once you have actually sent the payment in-game. A
            Super Admin will verify it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={paidToId}>Pay to</Label>
          <Select value={paidTo} onValueChange={setPaidTo}>
            <SelectTrigger id={paidToId} aria-label="Pay to">
              <SelectValue placeholder="Who you sent the payment to" />
            </SelectTrigger>
            <SelectContent>
              {recipients.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {pending ? "Working…" : "Yes, I've paid"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
