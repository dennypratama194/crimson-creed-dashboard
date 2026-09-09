"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; error?: string };

function finish(
  orderId: string,
  error: { message?: string } | null,
  fallback: string,
): ActionResult {
  if (error) return { ok: false, error: rpcErrorMessage(error, fallback) };
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  return { ok: true };
}

export async function startProcessingAction(
  orderId: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_order_processing", {
    p_order_id: orderId,
  });
  return finish(orderId, error, "Could not start processing.");
}

/**
 * One-step payment for a Super Admin: moves an open order straight to PAID,
 * whatever its current payment state. Covers orders the member never marked
 * "I've paid" (self-placed orders, or processing started before payment).
 * Backed by the `record_order_payment` RPC (Super-Admin-only, its own audit
 * trail — not a fake "member reported the payment").
 */
export async function recordOrderPaymentAction(
  orderId: string,
  note: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_order_payment", {
    p_order_id: orderId,
    p_note: note || null,
  });
  return finish(orderId, error, "Could not record the payment.");
}

export async function verifyPaymentAction(
  orderId: string,
  note: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_order_payment", {
    p_order_id: orderId,
    p_note: note || null,
  });
  return finish(orderId, error, "Could not verify the payment.");
}

export async function rejectPaymentAction(
  orderId: string,
  reason: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_order_payment", {
    p_order_id: orderId,
    p_reason: reason,
  });
  return finish(orderId, error, "Could not reject the payment.");
}

export async function recordDistributionAction(
  orderId: string,
  note: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_order_distribution", {
    p_order_id: orderId,
    p_note: note || null,
  });
  return finish(orderId, error, "Could not record distribution.");
}

export async function completeOrderAction(
  orderId: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_order", {
    p_order_id: orderId,
  });
  return finish(orderId, error, "Could not complete the order.");
}

export async function adminCancelOrderAction(
  orderId: string,
  reason: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason || null,
  });
  return finish(orderId, error, "Could not cancel the order.");
}

export async function adminRejectOrderAction(
  orderId: string,
  reason: string,
): Promise<ActionResult> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  return finish(orderId, error, "Could not reject the order.");
}
