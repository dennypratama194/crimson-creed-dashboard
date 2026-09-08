"use client";

import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** `YYYY-MM-DD` → local `Date` (no timezone shift), or `undefined` if unparseable. */
function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export type DatePickerProps = {
  /** Controlled value as `YYYY-MM-DD`. */
  value?: string;
  /** Initial value as `YYYY-MM-DD` when used uncontrolled (e.g. inside a form). */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** When set, a hidden input carries the `YYYY-MM-DD` value for form submits. */
  name?: string;
  id?: string;
  /** Earliest selectable day as `YYYY-MM-DD`. */
  min?: string;
  /** Latest selectable day as `YYYY-MM-DD`. */
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

/**
 * Trigger + popover calendar that emits `YYYY-MM-DD` — a themed replacement for
 * `<input type="date">`. Works controlled (`value`/`onChange`) or uncontrolled
 * (`name`/`defaultValue`) for server-action forms.
 */
export function DatePicker({
  value,
  defaultValue,
  onChange,
  name,
  id,
  min,
  max,
  disabled,
  placeholder = "Pick a date",
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);

  const current = isControlled ? value : internal;
  const selected = parseIsoDate(current);
  const minDate = parseIsoDate(min);
  const maxDate = parseIsoDate(max);

  const commit = (next: Date | undefined) => {
    if (!next) return;
    const iso = toIsoDate(next);
    if (!isControlled) setInternal(iso);
    onChange?.(iso);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-tone-error-border",
          !selected && "text-muted-foreground",
          className,
        )}
      >
        <span>{selected ? format(selected, "d MMM yyyy") : placeholder}</span>
        <CalendarIcon className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent>
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate ?? undefined}
          startMonth={minDate}
          endMonth={maxDate}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          onSelect={commit}
          autoFocus
        />
      </PopoverContent>
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </Popover>
  );
}
