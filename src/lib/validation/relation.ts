import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const relationInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
  joinedOn: z
    .string()
    .regex(ISO_DATE, "Choose a valid date")
    .refine((value) => {
      const ms = Date.parse(`${value}T00:00:00Z`);
      // Real date, and not a future typo (allow a day of slack for time zones).
      return Number.isFinite(ms) && ms <= Date.now() + 86_400_000;
    }, "The joined date cannot be in the future"),
  notes: z.string().trim().max(500, "Keep it under 500 characters").nullable(),
});

export type RelationInput = z.infer<typeof relationInputSchema>;

export function parseRelationForm(formData: FormData) {
  const notes = formData.get("notes");
  return relationInputSchema.safeParse({
    name: formData.get("name") ?? "",
    joinedOn: formData.get("joinedOn") ?? "",
    notes: typeof notes === "string" && notes.trim() !== "" ? notes : null,
  });
}

export const RELATION_LIST_SORTS = ["recent", "name"] as const;
export type RelationListSort = (typeof RELATION_LIST_SORTS)[number];
