"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPayrollRunAction } from "@/app/(app)/admin/payroll/actions";

export function NewRunForm({
  defaultStart,
  defaultEnd,
}: {
  defaultStart: string;
  defaultEnd: string;
}) {
  const router = useRouter();
  const startId = useId();
  const endId = useId();
  const noteId = useId();

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!start || !end) {
      setError("Pick a start and end date.");
      return;
    }
    if (end < start) {
      setError("The end date must be on or after the start date.");
      return;
    }

    startTransition(async () => {
      const result = await createPayrollRunAction({
        periodStart: start,
        periodEnd: end,
        note: note.trim() || null,
      });
      if (!result.ok || !result.data) {
        const message = result.error ?? "Could not open the payroll run.";
        setError(message);
        toast.error(message);
        return;
      }
      toast.success("Payroll run opened.");
      router.push(`/admin/payroll/${result.data.runId}`);
    });
  }

  return (
    <Card className="flex max-w-lg flex-col gap-4 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={startId}>Period start</Label>
          <Input
            id={startId}
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={endId}>Period end</Label>
          <Input
            id={endId}
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={noteId}>
          Note <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. August drug-lab wages"
          maxLength={300}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        The run opens as a draft. On the next screen you can see which approved
        logs it will include, then finalize to lock in each member&apos;s pay.
      </p>

      {error ? (
        <p className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Opening…" : "Open payroll run"}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => router.push("/admin/payroll")}
        >
          Cancel
        </Button>
      </div>
    </Card>
  );
}
