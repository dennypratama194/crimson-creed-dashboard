import { z } from "zod";

import { ITEM_UNITS } from "@/lib/constants/enums";

/** ISO date (YYYY-MM-DD), as emitted by <input type="date">. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker");

export const submitProductionLogSchema = z.object({
  itemId: z.uuid("Pick a product"),
  quantity: z
    .number({ error: "Enter how much you processed" })
    .positive("Must be greater than zero")
    .max(1_000_000, "That quantity is too large"),
  occurredAt: isoDate.nullish(),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters")
    .nullish(),
});
export type SubmitProductionLogInput = z.infer<
  typeof submitProductionLogSchema
>;

export const reviewProductionLogSchema = z
  .object({
    logId: z.uuid(),
    approve: z.boolean(),
    note: z.string().trim().max(300, "Keep it under 300 characters").nullish(),
  })
  .refine((v) => v.approve || !!v.note?.trim(), {
    error: "A reason is required to reject",
    path: ["note"],
  });
export type ReviewProductionLogInput = z.infer<
  typeof reviewProductionLogSchema
>;

export const createProductionProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Keep the name under 80 characters"),
  unit: z.enum(ITEM_UNITS),
  unitRate: z
    .number({ error: "Enter a pay rate" })
    .min(0, "Cannot be negative")
    .max(10_000_000, "That rate is too large"),
});
export type CreateProductionProductInput = z.infer<
  typeof createProductionProductSchema
>;

export const setProductionRateSchema = z.object({
  itemId: z.uuid(),
  unitRate: z
    .number({ error: "Enter a pay rate" })
    .min(0, "Cannot be negative")
    .max(10_000_000, "That rate is too large"),
});
export type SetProductionRateInput = z.infer<typeof setProductionRateSchema>;

export const createPayrollRunSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    note: z
      .string()
      .trim()
      .max(300, "Keep the note under 300 characters")
      .nullish(),
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    error: "The end date must be on or after the start date",
    path: ["periodEnd"],
  });
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

/** Member "my production" list tabs. */
export const PRODUCTION_LIST_SCOPES = [
  "all",
  "pending",
  "approved",
  "rejected",
] as const;
export type ProductionListScope = (typeof PRODUCTION_LIST_SCOPES)[number];
