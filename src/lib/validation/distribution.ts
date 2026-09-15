import { z } from "zod";

/**
 * Consignment draws. A Super Admin releases stash stock to a member, who owes
 * the company `quantity x rate` back. The browser never sends the rate or the
 * amount — `issue_distribution` computes both from the snapshot.
 */

export const setDistributionRateSchema = z.object({
  itemId: z.uuid("Pick an item"),
  unitRate: z
    .number({ error: "Enter the company cut per unit" })
    .min(0, "Cannot be negative")
    .max(100_000_000, "That rate is too large"),
});
export type SetDistributionRateInput = z.infer<
  typeof setDistributionRateSchema
>;

export const removeDistributionRateSchema = z.object({
  itemId: z.uuid(),
});
export type RemoveDistributionRateInput = z.infer<
  typeof removeDistributionRateSchema
>;

export const issueDistributionSchema = z.object({
  memberId: z.uuid("Pick a member"),
  itemId: z.uuid("Pick an item"),
  // Whole units only: a draw posts an inventory movement, and both
  // inventory.current_quantity and inventory_movements.quantity are integers.
  quantity: z
    .number({ error: "Enter how much they took" })
    .int("Use a whole number")
    .positive("Must be greater than zero")
    .max(10_000_000, "That quantity is too large"),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters")
    .nullish(),
});
export type IssueDistributionInput = z.infer<typeof issueDistributionSchema>;

export const settleDistributionSchema = z.object({
  distributionId: z.uuid(),
  note: z.string().trim().max(300, "Keep it under 300 characters").nullish(),
});
export type SettleDistributionInput = z.infer<typeof settleDistributionSchema>;

export const reverseDistributionSchema = z.object({
  distributionId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required to reverse a draw")
    .max(300, "Keep it under 300 characters"),
});
export type ReverseDistributionInput = z.infer<
  typeof reverseDistributionSchema
>;

/** Member "my draws" list tabs, and the admin grid filter. */
export const DRAW_LIST_SCOPES = ["all", "open", "settled"] as const;
export type DrawListScope = (typeof DRAW_LIST_SCOPES)[number];
