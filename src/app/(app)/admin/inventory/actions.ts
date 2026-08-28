"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; error?: string };

const stockActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("add"),
    quantity: z.number().int().positive().max(10_000_000),
    notes: z.string().trim().max(300),
  }),
  z.object({
    kind: z.literal("remove"),
    quantity: z.number().int().positive().max(10_000_000),
    notes: z.string().trim().max(300),
  }),
  z.object({
    kind: z.literal("set"),
    target: z.number().int().min(0).max(10_000_000),
    notes: z.string().trim().max(300),
  }),
]);

export async function applyStockAction(
  itemId: string,
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = stockActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the values and retry.",
    };
  }

  const supabase = await createClient();
  const action = parsed.data;

  const { error } =
    action.kind === "set"
      ? await supabase.rpc("adjust_inventory", {
          p_item_id: itemId,
          p_target_quantity: action.target,
          p_notes: action.notes || null,
        })
      : await supabase.rpc("record_inventory_movement", {
          p_item_id: itemId,
          p_movement_type: action.kind === "add" ? "IN" : "OUT",
          p_quantity:
            action.kind === "add" ? action.quantity : -action.quantity,
          p_notes: action.notes || null,
        });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not update stock."),
    };
  }

  revalidatePath("/admin/inventory");
  revalidatePath(`/admin/inventory/${itemId}`);
  return { ok: true };
}
