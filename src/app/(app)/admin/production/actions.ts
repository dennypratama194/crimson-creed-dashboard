"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  cancelProductionAssignmentSchema,
  createProductionAssignmentSchema,
  setAssignmentMemberPaidSchema,
  setProductionAssignmentPaidSchema,
} from "@/lib/validation/production";

export type ActionResult = { ok: boolean; error?: string };

function revalidateAssignments() {
  revalidatePath("/admin/production");
  revalidatePath("/production");
  revalidatePath("/dashboard");
}

export async function createProductionAssignmentAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = createProductionAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the details and retry.",
    };
  }

  const { memberIds, itemId, quantity, note } = parsed.data;
  const supabase = await createClient();
  // One job with a crew inside it, raised in a single transaction — if any
  // member is invalid, the whole assignment is rolled back.
  const { error } = await supabase.rpc("create_production_assignment", {
    p_member_ids: memberIds,
    p_item_id: itemId,
    p_quantity: quantity,
    p_note: note?.trim() ? note.trim() : null,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not create the assignment."),
    };
  }

  revalidateAssignments();
  return { ok: true };
}

/** Flips one person on a job. Bookkeeping only — posts nothing to company cash. */
export async function setAssignmentMemberPaidAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = setAssignmentMemberPaidSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Could not identify that person." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_assignment_member_paid", {
    p_line_id: parsed.data.lineId,
    p_paid: parsed.data.paid,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not update the payment status."),
    };
  }

  revalidateAssignments();
  return { ok: true };
}

/** Flips the whole crew at once. */
export async function setProductionAssignmentPaidAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = setProductionAssignmentPaidSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Could not identify that assignment." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_production_assignment_paid", {
    p_assignment_id: parsed.data.assignmentId,
    p_paid: parsed.data.paid,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not update the payment status."),
    };
  }

  revalidateAssignments();
  return { ok: true };
}

export async function cancelProductionAssignmentAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = cancelProductionAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the details and retry.",
    };
  }

  const { assignmentId, reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_production_assignment", {
    p_assignment_id: assignmentId,
    p_reason: reason?.trim() ? reason.trim() : null,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not cancel the assignment."),
    };
  }

  revalidateAssignments();
  return { ok: true };
}
