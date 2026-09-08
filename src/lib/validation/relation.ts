import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sentinel for the "no one assigned" option in the handler picker. */
export const RELATION_HANDLER_NONE = "none";

function pastOrToday(value: string): boolean {
  const ms = Date.parse(`${value}T00:00:00Z`);
  // Real date, and not a future typo (allow a day of slack for time zones).
  return Number.isFinite(ms) && ms <= Date.now() + 86_400_000;
}

export const relationInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
  joinedOn: z
    .string()
    .regex(ISO_DATE, "Choose a valid date")
    .refine(pastOrToday, "The joined date cannot be in the future"),
  notes: z.string().trim().max(500, "Keep it under 500 characters").nullable(),
  handlerMemberId: z.string().regex(UUID, "Choose a valid person").nullable(),
  metalScrapSettled: z.boolean(),
  oathDate: z
    .string()
    .regex(ISO_DATE, "Choose a valid date")
    .refine(pastOrToday, "The oath date cannot be in the future")
    .nullable(),
  bloodOath: z.boolean(),
});

export type RelationInput = z.infer<typeof relationInputSchema>;

export function parseRelationForm(formData: FormData) {
  const notes = formData.get("notes");
  const handler = formData.get("handlerMemberId");
  const oathDate = formData.get("oathDate");
  return relationInputSchema.safeParse({
    name: formData.get("name") ?? "",
    joinedOn: formData.get("joinedOn") ?? "",
    notes: typeof notes === "string" && notes.trim() !== "" ? notes : null,
    handlerMemberId:
      typeof handler === "string" && handler !== RELATION_HANDLER_NONE
        ? handler
        : null,
    metalScrapSettled: formData.get("metalScrapSettled") === "on",
    oathDate:
      typeof oathDate === "string" && oathDate.trim() !== "" ? oathDate : null,
    bloodOath: formData.get("bloodOath") === "on",
  });
}

export const RELATION_LIST_SORTS = ["recent", "name"] as const;
export type RelationListSort = (typeof RELATION_LIST_SORTS)[number];
