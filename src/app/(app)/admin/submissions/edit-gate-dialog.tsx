"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { MonthPicker } from "@/components/ui/month-picker";
import { setSubmissionGateAction } from "@/app/(app)/admin/submissions/actions";

export function EditGateDialog({
  enabled,
  startMonth,
  maxMonth,
  trigger,
}: {
  enabled: boolean;
  /** `YYYY-MM` or null */
  startMonth: string | null;
  /** `YYYY-MM` — the current month; the gate can't start in the future. */
  maxMonth: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const enabledId = useId();
  const monthId = useId();

  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(enabled);
  const [month, setMonth] = useState(startMonth ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOn(enabled);
    setMonth(startMonth ?? "");
    setError(null);
  }

  function save() {
    setError(null);
    if (on && !month) {
      setError("Pick the month the gate should start from.");
      return;
    }

    startTransition(async () => {
      const result = await setSubmissionGateAction({
        enabled: on,
        startMonth: month || null,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not update the order gate.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success(on ? "Order gate enabled." : "Order gate disabled.");
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
          <DialogTitle>Order gate</DialogTitle>
          <DialogDescription>
            While on, a member cannot place orders if any month from the start
            month onward has no confirmed material submission. The current month
            never blocks.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id={enabledId}
              checked={on}
              onCheckedChange={(v) => setOn(v === true)}
            />
            <Label htmlFor={enabledId} className="font-normal">
              Lock ordering for members who owe a confirmed submission
            </Label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={monthId}>Start from</Label>
            <MonthPicker
              id={monthId}
              max={maxMonth}
              value={month}
              onChange={setMonth}
              className="w-[10.5rem]"
            />
            <p className="text-xs text-muted-foreground">
              Months before this are never counted as owed.
            </p>
          </div>
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
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
