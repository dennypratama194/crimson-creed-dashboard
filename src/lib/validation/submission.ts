import { z } from "zod";

/** `YYYY-MM`, as emitted by <input type="month">. */
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, "Use the month picker");

const quantity = z
  .number({ error: "Enter a whole number" })
  .int("Whole numbers only")
  .min(0, "Cannot be negative")
  .max(10_000_000, "That amount is too large");

const submissionLine = z.object({
  materialTypeId: z.uuid(),
  quantity,
});

export const submitMaterialSubmissionSchema = z.object({
  lines: z.array(submissionLine).min(1, "Nothing to submit"),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters")
    .nullish(),
  /** Omit for the current month; set (`YYYY-MM`) to clear an owed debt month. */
  periodMonth: isoMonth.nullish(),
});
export type SubmitMaterialSubmissionInput = z.infer<
  typeof submitMaterialSubmissionSchema
>;

export const confirmMemberSubmissionSchema = z.object({
  submissionId: z.uuid(),
  /** Omit to confirm the member's figures as-is; provide to adjust them. */
  lines: z.array(submissionLine).nullish(),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters")
    .nullish(),
});
export type ConfirmMemberSubmissionInput = z.infer<
  typeof confirmMemberSubmissionSchema
>;

export const rejectMemberSubmissionSchema = z.object({
  submissionId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required")
    .max(300, "Keep it under 300 characters"),
});
export type RejectMemberSubmissionInput = z.infer<
  typeof rejectMemberSubmissionSchema
>;

export const setSubmissionGateSchema = z.object({
  enabled: z.boolean(),
  /** `YYYY-MM`; required by the RPC when enabling. */
  startMonth: isoMonth.nullish(),
});
export type SetSubmissionGateInput = z.infer<typeof setSubmissionGateSchema>;

export const setSubmissionTargetsSchema = z.object({
  periodMonth: isoMonth,
  targets: z.array(
    z.object({
      materialTypeId: z.uuid(),
      targetQuantity: z
        .number({ error: "Enter a whole number" })
        .int("Whole numbers only")
        .min(0, "Cannot be negative")
        .max(10_000_000, "That target is too large"),
    }),
  ),
});
export type SetSubmissionTargetsInput = z.infer<
  typeof setSubmissionTargetsSchema
>;
