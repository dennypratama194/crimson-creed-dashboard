"use client";

import { useId, useState, useTransition, type ReactNode } from "react";

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

type Result = { ok: boolean; error?: string } | void;

/**
 * Confirmation dialog with an optional free-text field (order notes, cancel /
 * rejection reasons). `onConfirm` receives the trimmed text.
 */
export function ActionDialog({
  trigger,
  title,
  description,
  warning,
  confirmLabel = "Confirm",
  destructive = false,
  field,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  warning?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  field?: { label: string; placeholder?: string; required?: boolean };
  onConfirm: (text: string) => Promise<Result>;
}) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setText("");
    setError(null);
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
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {warning ? (
          <p className="rounded-md border border-tone-warning-border bg-tone-warning-bg px-3 py-2 text-sm text-tone-warning-fg">
            {warning}
          </p>
        ) : null}

        {field ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId}>
              {field.label}
              {field.required ? (
                <span className="text-destructive"> *</span>
              ) : (
                <span className="text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Textarea
              id={fieldId}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={field.placeholder}
              maxLength={500}
            />
          </div>
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
          <Button
            variant={destructive ? "destructive" : "primary"}
            disabled={pending}
            onClick={() => {
              if (field?.required && text.trim() === "") {
                setError(`${field.label} is required.`);
                return;
              }
              startTransition(async () => {
                const result = await onConfirm(text.trim());
                if (result && !result.ok) {
                  setError(result.error ?? "Something went wrong.");
                } else {
                  setOpen(false);
                }
              });
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
