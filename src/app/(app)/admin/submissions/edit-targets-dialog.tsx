"use client";

import { useState, useTransition, type ReactNode } from "react";

import type { AdminMaterialColumn } from "@/lib/db/submissions";
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
import { setSubmissionTargetsAction } from "@/app/(app)/admin/submissions/actions";

export function EditTargetsDialog({
  periodMonthParam,
  monthLabel,
  materials,
  trigger,
}: {
  /** `YYYY-MM` */
  periodMonthParam: string;
  monthLabel: string;
  materials: AdminMaterialColumn[];
  trigger: ReactNode;
}) {
  const initial = () =>
    Object.fromEntries(materials.map((m) => [m.id, String(m.target ?? 0)]));

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const targets = materials.map((m) => {
      const raw = values[m.id]?.trim() ?? "";
      return {
        materialTypeId: m.id,
        targetQuantity: raw === "" ? 0 : Number(raw),
      };
    });
    for (const t of targets) {
      if (!Number.isInteger(t.targetQuantity) || t.targetQuantity < 0) {
        setError("Targets must be whole numbers of zero or more.");
        return;
      }
    }

    startTransition(async () => {
      const result = await setSubmissionTargetsAction({
        periodMonth: periodMonthParam,
        targets,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not save the targets.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success("Targets saved.");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setValues(initial());
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Monthly targets — {monthLabel}</DialogTitle>
          <DialogDescription>
            The expected amount per member. Informational only — it never blocks
            a submission.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {materials.map((m) => (
            <div key={m.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`tgt-${m.id}`}>{m.name}</Label>
              <Input
                id={`tgt-${m.id}`}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={values[m.id] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [m.id]: e.target.value }))
                }
              />
            </div>
          ))}
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
            {pending ? "Saving…" : "Save targets"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
