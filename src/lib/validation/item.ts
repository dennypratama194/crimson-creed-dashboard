import { z } from "zod";

import {
  ITEM_CATEGORIES,
  ITEM_UNITS,
  STOCK_TYPES,
} from "@/lib/constants/enums";

export const itemInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
  stockType: z.enum(STOCK_TYPES),
  category: z.enum(ITEM_CATEGORIES),
  unit: z.enum(ITEM_UNITS),
  price: z
    .number({ error: "Enter a price" })
    .min(0, "Price must be zero or more")
    .max(1_000_000_000, "Price is too large"),
  description: z
    .string()
    .trim()
    .max(500, "Keep it under 500 characters")
    .nullable(),
  sku: z.string().trim().max(60, "Code is too long").nullable(),
  lowStockThreshold: z
    .number({ error: "Enter a threshold" })
    .int("Whole numbers only")
    .min(0, "Cannot be negative")
    .max(10_000_000, "Too large"),
  orderable: z.boolean(),
  active: z.boolean(),
  imageUrl: z
    .string()
    .trim()
    .max(1000, "URL is too long")
    .refine(
      (v) => v === "" || v.startsWith("http://") || v.startsWith("https://"),
      { message: "Enter an http(s) image URL" },
    )
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

export type ItemInput = z.infer<typeof itemInputSchema>;

/** Build a typed object from a submitted form, then validate it. */
export function parseItemForm(formData: FormData) {
  const num = (key: string) => {
    const raw = formData.get(key);
    if (raw === null || raw === "") return Number.NaN;
    return Number(raw);
  };
  const str = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim() !== "" ? raw : null;
  };

  const rawStockType = formData.get("stockType");
  const isCatalogue = rawStockType === "CATALOGUE" || rawStockType == null;

  return itemInputSchema.safeParse({
    name: formData.get("name") ?? "",
    stockType: rawStockType ?? "CATALOGUE",
    category: formData.get("category"),
    unit: formData.get("unit"),
    // Only catalogue items carry a member-facing price / order flag; the rest
    // live in the stash only, so pin those regardless of what was submitted.
    price: isCatalogue ? num("price") : 0,
    description: str("description"),
    sku: isCatalogue ? str("sku") : null,
    // Low-stock alerts are a catalogue concept only; stash items have no threshold.
    lowStockThreshold: isCatalogue ? num("lowStockThreshold") : 0,
    orderable: isCatalogue && formData.get("orderable") === "on",
    active: formData.get("active") === "on",
    imageUrl:
      typeof formData.get("imageUrl") === "string"
        ? (formData.get("imageUrl") as string)
        : "",
  });
}

export const ITEM_LIST_STATUSES = [
  "all",
  "active",
  "inactive",
  "archived",
] as const;
export type ItemListStatus = (typeof ITEM_LIST_STATUSES)[number];

export const ITEM_LIST_SORTS = [
  "name",
  "price_desc",
  "price_asc",
  "recent",
] as const;
export type ItemListSort = (typeof ITEM_LIST_SORTS)[number];
