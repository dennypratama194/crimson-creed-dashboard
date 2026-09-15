"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  issueDistributionSchema,
  removeDistributionRateSchema,
  reverseDistributionSchema,
  setDistributionRateSchema,
  settleDistributionSchema,
} from "@/lib/validation/distribution";

export type ActionResult = { ok: boolean; error?: string };

/** A draw changes stash levels, so the stash views go stale alongside it. */
function revalidateDraw() {
  revalidatePath("/admin/distribution");
  revalidatePath("/admin/inventory");
  revalidatePath("/distribution");
  revalidatePath("/dashboard");
}

export async function setDistributionRateAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = setDistributionRateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the rate and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_distribution_rate", {
    p_item_id: parsed.data.itemId,
    p_unit_rate: parsed.data.unitRate,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not save the company cut."),
    };
  }

  revalidatePath("/admin/distribution/rates");
  revalidatePath("/admin/distribution");
  return { ok: true };
}

export async function removeDistributionRateAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = removeDistributionRateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Could not identify that item." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_distribution_rate", {
    p_item_id: parsed.data.itemId,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not remove the company cut."),
    };
  }

  revalidatePath("/admin/distribution/rates");
  revalidatePath("/admin/distribution");
  return { ok: true };
}

/**
 * Releases stash stock to a member and records what they owe. The amount is
 * computed by the RPC from the snapshot rate — never sent from the browser.
 */
export async function issueDistributionAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = issueDistributionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the details and retry.",
    };
  }

  const { memberId, itemId, quantity, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_distribution", {
    p_member_id: memberId,
    p_item_id: itemId,
    p_quantity: quantity,
    p_note: note?.trim() ? note.trim() : null,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not record the draw."),
    };
  }

  revalidateDraw();
  return { ok: true };
}

export async function settleDistributionAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = settleDistributionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the details and retry.",
    };
  }

  const { distributionId, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_distribution", {
    p_distribution_id: distributionId,
    p_note: note?.trim() ? note.trim() : null,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not mark that draw as done."),
    };
  }

  revalidateDraw();
  return { ok: true };
}

/** Undoes a mis-entered draw: the stock goes back and the debt is voided. */
export async function reverseDistributionAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = reverseDistributionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "A reason is required.",
    };
  }

  const { distributionId, reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_distribution", {
    p_distribution_id: distributionId,
    p_reason: reason.trim(),
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not reverse the draw."),
    };
  }

  revalidateDraw();
  return { ok: true };
}
