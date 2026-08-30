import { z } from "zod";

export const supplierInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(120, "Name is too long"),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(20, "Code is too long"),
  contact: z
    .string()
    .trim()
    .max(200, "Keep it under 200 characters")
    .nullable(),
  notes: z.string().trim().max(500, "Keep it under 500 characters").nullable(),
  active: z.boolean(),
});

export type SupplierInput = z.infer<typeof supplierInputSchema>;

export function parseSupplierForm(formData: FormData) {
  const str = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === "string" && raw.trim() !== "" ? raw : null;
  };

  return supplierInputSchema.safeParse({
    name: formData.get("name") ?? "",
    code: formData.get("code") ?? "",
    contact: str("contact"),
    notes: str("notes"),
    active: formData.get("active") === "on",
  });
}

/** One line of a supplier's price book. sell_price / max_quantity are optional
 *  (procure-only items have neither). */
export const supplierItemInputSchema = z.object({
  itemId: z.uuid("Choose an item"),
  buyPrice: z
    .number({ error: "Enter a buy price" })
    .min(0, "Buy price must be zero or more")
    .max(1_000_000_000, "That is too large"),
  sellPrice: z
    .number()
    .min(0, "Sell price cannot be negative")
    .max(1_000_000_000, "That is too large")
    .nullable(),
  maxQuantity: z
    .number()
    .int("Whole numbers only")
    .min(0, "Cannot be negative")
    .max(10_000_000, "That is too large")
    .nullable(),
  active: z.boolean(),
});

export type SupplierItemInput = z.infer<typeof supplierItemInputSchema>;

export function parseSupplierItemForm(formData: FormData) {
  const num = (key: string) => {
    const raw = formData.get(key);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : Number.NaN;
  };
  const required = (key: string) => {
    const raw = formData.get(key);
    if (raw === null || raw === "") return Number.NaN;
    return Number(raw);
  };

  return supplierItemInputSchema.safeParse({
    itemId: formData.get("itemId") ?? "",
    buyPrice: required("buyPrice"),
    sellPrice: num("sellPrice"),
    maxQuantity: num("maxQuantity"),
    active: formData.get("active") === "on",
  });
}

export const SUPPLIER_LIST_STATUSES = [
  "all",
  "active",
  "inactive",
  "archived",
] as const;
export type SupplierListStatus = (typeof SUPPLIER_LIST_STATUSES)[number];

export const SUPPLIER_LIST_SORTS = ["name", "recent"] as const;
export type SupplierListSort = (typeof SUPPLIER_LIST_SORTS)[number];
