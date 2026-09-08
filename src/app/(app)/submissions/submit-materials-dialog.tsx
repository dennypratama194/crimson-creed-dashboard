"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

import type { MaterialType } from "@/lib/db/submissions";
import { formatQuantity } from "@/lib/format";
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
import { Textarea } from "@/components/ui/textarea";
import { submitMaterialSubmissionAction } from "@/app/(app)/submissions/actions";

export function SubmitMaterialsDialog({
  materials,
  targets,
  initialQuantities,
  monthLabel,
  mode,
  periodMonth,
  trigger,
}: {
  materials: MaterialType[];
  targets: Record<string, number>;
  initialQuantities: Record<string, number>;
  monthLabel: string;
  mode: "submit" | "update" | "resubmit";
  /** `YYYY-MM` when submitting for a past debt month; omit for the current month. */
  periodMonth?: string;
  trigger: ReactNode;
}) {
  const router = useRouter();
  const noteId = useId();

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      materials.map((m) => [
        m.id,
        initialQuantities[m.id] != null ? String(initialQuantities[m.id]) : "",
      ]),
    ),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setValues(
      Object.fromEntries(
        materials.map((m) => [
          m.id,
          initialQuantities[m.id] != null
            ? String(initialQuantities[m.id])
            : "",
        ]),
      ),
    );
    setNote("");
    setError(null);
  }

  function submit() {
    setError(null);

    const lines = materials.map((m) => {
      const raw = values[m.id]?.trim() ?? "";
      return { materialTypeId: m.id, quantity: raw === "" ? 0 : Number(raw) };
    });

    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 0) {
        setError("Enter whole numbers of zero or more.");
        return;
      }
    }

    startTransition(async () => {
      const result = await submitMaterialSubmissionAction({
        lines,
        note: note.trim() || null,
        periodMonth: periodMonth ?? null,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not send your submission.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success("Submitted — a Super Admin will confirm it.");
      router.refresh();
    });
  }

  const title =
    mode === "submit"
      ? `Submit materials for ${monthLabel}`
      : mode === "resubmit"
        ? `Resubmit for ${monthLabel}`
        : `Update your ${monthLabel} submission`;

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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Enter how much of each you handed in. Leave a field blank for none.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {materials.map((m) => {
            const target = targets[m.id] ?? 0;
            return (
              <div key={m.id} className="flex flex-col gap-1.5">
                <Label htmlFor={`mat-${m.id}`}>
                  {m.name}
                  {target > 0 ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · target {formatQuantity(target)}
                    </span>
                  ) : null}
                </Label>
                <Input
                  id={`mat-${m.id}`}
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
            );
          })}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={noteId}>
              Note <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the reviewer should know"
              maxLength={300}
            />
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
          <Button onClick={submit} disabled={pending}>
            {pending ? "Sending…" : "Send submission"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
