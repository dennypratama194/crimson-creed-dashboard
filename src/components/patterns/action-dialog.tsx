"use client";

import { useId, useState, useTransition, type ReactNode } from "react";

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
import { Textarea } from "@/components/ui/textarea";

type Result = { ok: boolean; error?: string } | void;

type SelectField = {
  label: string;
  placeholder?: string;
  required?: boolean;
  options: { value: string; label: string }[];
  defaultValue?: string;
};

/**
 * Confirmation dialog with an optional free-text field (order notes, cancel /
 * rejection reasons) and an optional single-select (e.g. "Paid to"). `onConfirm`
 * receives the trimmed text and the selected value ("" when none picked).
 */
export function ActionDialog({
  trigger,
  title,
  description,
  warning,
  confirmLabel = "Confirm",
  destructive = false,
  field,
  select,
  successMessage,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  warning?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  field?: { label: string; placeholder?: string; required?: boolean };
  select?: SelectField;
  /** Toast shown when onConfirm resolves ok. */
  successMessage?: string;
  onConfirm: (text: string, selectValue: string) => Promise<Result>;
}) {
  const fieldId = useId();
  const selectId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [selectValue, setSelectValue] = useState(select?.defaultValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setText("");
    setSelectValue(select?.defaultValue ?? "");
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

        {select ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={selectId}>
              {select.label}
              {select.required ? (
                <span className="text-destructive"> *</span>
              ) : (
                <span className="text-muted-foreground"> (optional)</span>
              )}
            </Label>
            <Select value={selectValue} onValueChange={setSelectValue}>
              <SelectTrigger id={selectId} aria-label={select.label}>
                <SelectValue placeholder={select.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {select.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              if (select?.required && selectValue === "") {
                setError(`${select.label} is required.`);
                return;
              }
              startTransition(async () => {
                const result = await onConfirm(text.trim(), selectValue);
                if (result && !result.ok) {
                  const message = result.error ?? "Something went wrong.";
                  setError(message);
                  toast.error(message);
                } else {
                  setOpen(false);
                  if (successMessage) toast.success(successMessage);
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
