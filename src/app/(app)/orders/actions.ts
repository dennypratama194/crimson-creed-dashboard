"use server";

import { revalidatePath } from "next/cache";

import { requireActiveMember } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  createOrderSchema,
  submitOrderPaymentSchema,
} from "@/lib/validation/order";

export type ActionResult<T = undefined> = {
  ok: boolean;
  error?: string;
  data?: T;
};

export async function createOrderAction(
  input: unknown,
): Promise<ActionResult<{ orderId: string }>> {
  await requireActiveMember();

  // Order creation notifies every Super Admin and writes ~5 rows. The per-member
  // cap lives inside create_order (migration 0079), where a direct PostgREST
  // call cannot skip it; its refusal comes back as a readable error below.
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Check the order and try again.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_items: parsed.data.items,
    p_note: parsed.data.note ?? null,
  });

  if (error || !data) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not place the order."),
    };
  }

  revalidatePath("/orders");
  return { ok: true, data: { orderId: data.id } };
}

export async function submitPaymentAction(
  input: unknown,
): Promise<ActionResult> {
  // Rate-limited inside submit_order_payment (0079).
  await requireActiveMember();

  const parsed = submitOrderPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the payment details.",
    };
  }
  const { orderId, paidTo } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_order_payment", {
    p_order_id: orderId,
    p_paid_to: paidTo,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not record your payment."),
    };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function cancelOrderAction(
  orderId: string,
  reason?: string,
): Promise<ActionResult> {
  // Rate-limited inside cancel_order (0079).
  await requireActiveMember();

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason?.trim() ? reason.trim() : null,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not cancel the order."),
    };
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
