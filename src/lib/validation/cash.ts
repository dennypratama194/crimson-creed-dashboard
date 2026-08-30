import { z } from "zod";

import { CASH_CATEGORY_DIRECTION } from "@/lib/constants/cash";
import { CASH_CATEGORIES, CASH_DIRECTIONS } from "@/lib/constants/enums";

/** ISO date (YYYY-MM-DD), as emitted by <input type="date">. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker");

export const recordCashEntrySchema = z
  .object({
    direction: z.enum(CASH_DIRECTIONS),
    amount: z
      .number({ error: "Enter an amount" })
      .positive("Must be greater than zero")
      .max(999_999_999_999, "That amount is too large"),
    category: z.enum(CASH_CATEGORIES),
    handledBy: z.uuid("Choose who handled this"),
    occurredAt: isoDate.nullish(),
    note: z
      .string()
      .trim()
      .max(300, "Keep the note under 300 characters")
      .nullish(),
    allowNegative: z.boolean().optional(),
  })
  .refine((v) => CASH_CATEGORY_DIRECTION[v.category] === v.direction, {
    error: "Pick a category that matches income or expense",
    path: ["category"],
  });
export type RecordCashEntryInput = z.infer<typeof recordCashEntrySchema>;

export const reverseCashEntrySchema = z.object({
  entryId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required")
    .max(300, "Keep it under 300 characters"),
});
export type ReverseCashEntryInput = z.infer<typeof reverseCashEntrySchema>;

/** Ledger list filters (URL-driven). */
export const CASH_LIST_DIRECTIONS = ["all", ...CASH_DIRECTIONS] as const;
export type CashListDirection = (typeof CASH_LIST_DIRECTIONS)[number];
