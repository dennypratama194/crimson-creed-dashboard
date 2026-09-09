import { z } from "zod";

export const orderLineSchema = z.object({
  item_id: z.uuid(),
  quantity: z
    .number({ error: "Enter a quantity" })
    .int("Whole numbers only")
    .positive("Must be greater than zero")
    .max(1_000_000, "That quantity is too large"),
});

export const createOrderSchema = z.object({
  items: z
    .array(orderLineSchema)
    .min(1, "Add at least one item")
    .max(50, "An order can have at most 50 lines"),
  note: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters")
    .nullish(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const submitOrderPaymentSchema = z.object({
  orderId: z.uuid(),
  paidTo: z.uuid({ error: "Choose who you paid" }),
});

export type SubmitOrderPaymentInput = z.infer<typeof submitOrderPaymentSchema>;

export const ORDER_LIST_SCOPES = ["all", "open", "closed"] as const;
export type OrderListScope = (typeof ORDER_LIST_SCOPES)[number];
