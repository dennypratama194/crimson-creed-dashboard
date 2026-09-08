"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  confirmMemberSubmissionSchema,
  rejectMemberSubmissionSchema,
  setSubmissionGateSchema,
  setSubmissionTargetsSchema,
} from "@/lib/validation/submission";

export type ActionResult<T = undefined> = {
  ok: boolean;
  error?: string;
  data?: T;
};

export async function confirmMemberSubmissionAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = confirmMemberSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Check the entry and try again.",
    };
  }

  const { submissionId, lines, note, receivedBy } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_member_submission", {
    p_submission_id: submissionId,
    p_lines: lines
      ? lines.map((l) => ({
          material_type_id: l.materialTypeId,
          quantity: l.quantity,
        }))
      : null,
    p_note: note?.trim() ? note.trim() : null,
    p_received_by: receivedBy ?? null,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not confirm the submission."),
    };
  }

  revalidatePath("/admin/submissions");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function rejectMemberSubmissionAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = rejectMemberSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Enter a reason and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_member_submission", {
    p_submission_id: parsed.data.submissionId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not reject the submission."),
    };
  }

  revalidatePath("/admin/submissions");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setSubmissionGateAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = setSubmissionGateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Check the settings and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_submission_gate", {
    p_enabled: parsed.data.enabled,
    p_start_month: parsed.data.startMonth
      ? `${parsed.data.startMonth}-01`
      : null,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not update the order gate."),
    };
  }

  revalidatePath("/admin/submissions");
  revalidatePath("/orders/new");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setSubmissionTargetsAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = setSubmissionTargetsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Check the targets and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_submission_targets", {
    p_period_month: `${parsed.data.periodMonth}-01`,
    p_targets: parsed.data.targets.map((t) => ({
      material_type_id: t.materialTypeId,
      target_quantity: t.targetQuantity,
    })),
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not save the targets."),
    };
  }

  revalidatePath("/admin/submissions");
  return { ok: true };
}
