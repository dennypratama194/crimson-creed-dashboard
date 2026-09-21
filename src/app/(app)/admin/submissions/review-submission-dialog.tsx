"use client";

import { useId, useState, useTransition, type ReactNode } from "react";

import type { MemberOption } from "@/lib/db/members";
import type { AdminMaterialColumn } from "@/lib/db/submissions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmMemberSubmissionAction,
  rejectMemberSubmissionAction,
} from "@/app/(app)/admin/submissions/actions";

export function ReviewSubmissionDialog({
  submissionId,
  memberName,
  monthLabel,
  materials,
  quantities,
  receivers,
  initialReceivedById,
  alreadyConfirmed,
  trigger,
}: {
  submissionId: string;
  memberName: string;
  monthLabel: string;
  materials: AdminMaterialColumn[];
  quantities: Record<string, number>;
  receivers: MemberOption[];
  /** The PIC the member recorded, if any. */
  initialReceivedById: string | null;
  alreadyConfirmed: boolean;
  trigger: ReactNode;
}) {
  const noteId = useId();
  const receivedById = useId();

  const initial = () =>
    Object.fromEntries(
      materials.map((m) => [m.id, String(quantities[m.id] ?? 0)]),
    );

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [note, setNote] = useState("");
  const [receivedBy, setReceivedBy] = useState(initialReceivedById ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setValues(initial());
    setNote("");
    setReceivedBy(initialReceivedById ?? "");
    setError(null);
  }

  function parseLines() {
    const lines = materials.map((m) => {
      const raw = values[m.id]?.trim() ?? "";
      return { materialTypeId: m.id, quantity: raw === "" ? 0 : Number(raw) };
    });
    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity < 0) return null;
    }
    return lines;
  }

  function confirm() {
    setError(null);
    const lines = parseLines();
    if (!lines) {
      setError("Enter whole numbers of zero or more.");
      return;
    }
    startTransition(async () => {
      const result = await confirmMemberSubmissionAction({
        submissionId,
        lines,
        note: note.trim() || null,
        receivedBy: receivedBy || null,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not confirm.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success(
        alreadyConfirmed ? "Submission adjusted." : "Submission confirmed.",
      );
    });
  }

  function reject() {
    setError(null);
    if (note.trim() === "") {
      setError("A reason is required to reject.");
      return;
    }
    startTransition(async () => {
      const result = await rejectMemberSubmissionAction({
        submissionId,
        reason: note.trim(),
      });
      if (!result.ok) {
        const message = result.error ?? "Could not reject.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success("Submission rejected.");
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
          <DialogTitle>
            {alreadyConfirmed ? "Adjust" : "Review"} — {memberName}
          </DialogTitle>
          <DialogDescription>
            {monthLabel}. Correct the figures if needed, then confirm.
            {alreadyConfirmed
              ? " Confirming again posts the stock difference."
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {materials.map((m) => (
            <div key={m.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`rev-${m.id}`}>
                {m.name}
                {m.target > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · target {formatQuantity(m.target)}
                  </span>
                ) : null}
              </Label>
              <Input
                id={`rev-${m.id}`}
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={receivedById}>Received by</Label>
            <Select value={receivedBy} onValueChange={setReceivedBy}>
              <SelectTrigger id={receivedById} aria-label="Received by">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                {receivers.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={noteId}>
              Note{" "}
              <span className="text-muted-foreground">
                (required to reject)
              </span>
            </Label>
            <Textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional for confirm; explain any rejection"
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
          <Button variant="destructive" disabled={pending} onClick={reject}>
            Reject
          </Button>
          <Button disabled={pending} onClick={confirm}>
            {pending
              ? "Working…"
              : alreadyConfirmed
                ? "Save adjustment"
                : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
