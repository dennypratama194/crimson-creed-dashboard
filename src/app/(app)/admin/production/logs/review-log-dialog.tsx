"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { reviewProductionLogAction } from "@/app/(app)/admin/production/actions";

export function ReviewLogDialog({
  logId,
  summary,
}: {
  logId: string;
  summary: string;
}) {
  const router = useRouter();
  const noteId = useId();

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(approve: boolean) {
    setError(null);
    if (!approve && note.trim() === "") {
      setError("A reason is required to reject.");
      return;
    }
    startTransition(async () => {
      const result = await reviewProductionLogAction({
        logId,
        approve,
        note: note.trim() || null,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not record the review.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success(approve ? "Production approved." : "Production rejected.");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setNote("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Review
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Review production log</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>
            Note{" "}
            <span className="text-muted-foreground">(required to reject)</span>
          </Label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional for approval; explain any rejection"
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
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => run(false)}
          >
            Reject
          </Button>
          <Button disabled={pending} onClick={() => run(true)}>
            {pending ? "Working…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
