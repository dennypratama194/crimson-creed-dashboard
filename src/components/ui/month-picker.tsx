"use client";

import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `YYYY-MM` → `{ year, month }` (month 0-indexed), or `null` if unparseable. */
function parseMonth(
  value: string | undefined,
): { year: number; month: number } | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}

function toValue(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Ordinal for month comparisons: `year * 12 + month`. */
function ordinal(year: number, month: number): number {
  return year * 12 + month;
}

export type MonthPickerProps = {
  /** Controlled value as `YYYY-MM`. */
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
  /** Earliest selectable month as `YYYY-MM`. */
  min?: string;
  /** Latest selectable month as `YYYY-MM`. */
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

/**
 * Trigger + popover year/month grid that emits `YYYY-MM` — a themed replacement
 * for `<input type="month">`.
 */
export function MonthPicker({
  value,
  onChange,
  id,
  min,
  max,
  disabled,
  placeholder = "Pick a month",
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: MonthPickerProps) {
  const selected = parseMonth(value);
  const minParts = parseMonth(min);
  const maxParts = parseMonth(max);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    selected?.year ?? maxParts?.year ?? new Date().getFullYear(),
  );

  const minOrd = minParts ? ordinal(minParts.year, minParts.month) : -Infinity;
  const maxOrd = maxParts ? ordinal(maxParts.year, maxParts.month) : Infinity;

  const prevYearDisabled = minParts !== null && viewYear - 1 < minParts.year;
  const nextYearDisabled = maxParts !== null && viewYear + 1 > maxParts.year;

  const label = selected
    ? format(new Date(selected.year, selected.month, 1), "MMMM yyyy")
    : placeholder;

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
        <span>{label}</span>
        <CalendarDays className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-[16rem]">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous year"
            disabled={prevYearDisabled}
            onClick={() => setViewYear((y) => y - 1)}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium tabular-nums">{viewYear}</span>
          <button
            type="button"
            aria-label="Next year"
            disabled={nextYearDisabled}
            onClick={() => setViewYear((y) => y + 1)}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTH_LABELS.map((monthLabel, month) => {
            const ord = ordinal(viewYear, month);
            const isDisabled = ord < minOrd || ord > maxOrd;
            const isSelected =
              selected?.year === viewYear && selected.month === month;
            return (
              <button
                key={monthLabel}
                type="button"
                disabled={isDisabled}
                aria-pressed={isSelected}
                onClick={() => {
                  onChange?.(toValue(viewYear, month));
                  setOpen(false);
                }}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-md text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40",
                  isSelected &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
              >
                {monthLabel}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
