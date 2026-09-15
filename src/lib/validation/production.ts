import { z } from "zod";

/**
 * Production assignments (Phase 19). A Super Admin records who is in charge of
 * a job and flips the paid flag; members never file one, so there is no submit
 * or review schema here.
 */

export const createProductionAssignmentSchema = z.object({
  // A job can have a crew in charge; each member gets their own assignment row
  // so they are tracked and paid individually.
  memberIds: z
    .array(z.uuid())
    .min(1, "Pick who is in charge")
    .max(50, "That is too many people for one assignment"),
  itemId: z.uuid("Pick a product"),
  quantity: z
    .number({ error: "Enter how much they are producing" })
    .positive("Must be greater than zero")
    .max(10_000_000, "That quantity is too large"),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters")
    .nullish(),
});
export type CreateProductionAssignmentInput = z.infer<
  typeof createProductionAssignmentSchema
>;

/** Flip one person on a job. The crew line id, not the member id. */
export const setAssignmentMemberPaidSchema = z.object({
  lineId: z.uuid(),
  paid: z.boolean(),
});
export type SetAssignmentMemberPaidInput = z.infer<
  typeof setAssignmentMemberPaidSchema
>;

/** Flip the whole crew at once. */
export const setProductionAssignmentPaidSchema = z.object({
  assignmentId: z.uuid(),
  paid: z.boolean(),
});
export type SetProductionAssignmentPaidInput = z.infer<
  typeof setProductionAssignmentPaidSchema
>;

export const cancelProductionAssignmentSchema = z.object({
  assignmentId: z.uuid(),
  reason: z.string().trim().max(300, "Keep it under 300 characters").nullish(),
});
export type CancelProductionAssignmentInput = z.infer<
  typeof cancelProductionAssignmentSchema
>;

/** Assignment list tabs, shared by the admin board and the member view. */
export const PRODUCTION_LIST_SCOPES = [
  "all",
  "unpaid",
  "paid",
  "cancelled",
] as const;
export type ProductionListScope = (typeof PRODUCTION_LIST_SCOPES)[number];
