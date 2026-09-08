"use server";

import { revalidatePath } from "next/cache";

import { requireActiveMember } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { submitMaterialSubmissionSchema } from "@/lib/validation/submission";

export type ActionResult<T = undefined> = {
  ok: boolean;
  error?: string;
  data?: T;
};

export async function submitMaterialSubmissionAction(
  input: unknown,
): Promise<ActionResult<{ submissionId: string }>> {
  const member = await requireActiveMember();

  const limited = await checkRateLimit(
    `submission:submit:${member.id}`,
    { limit: 15 },
    "You're submitting too fast.",
  );
  if (limited) return { ok: false, error: limited };

  const parsed = submitMaterialSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Check the amounts and try again.",
    };
  }

  const { lines, note, periodMonth, receivedBy } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_material_submission", {
    p_lines: lines.map((l) => ({
      material_type_id: l.materialTypeId,
      quantity: l.quantity,
    })),
    p_note: note?.trim() ? note.trim() : null,
    p_period_month: periodMonth ? `${periodMonth}-01` : null,
    p_received_by: receivedBy,
  });

  if (error || !data) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not send your submission."),
    };
  }

  revalidatePath("/submissions");
  revalidatePath("/admin/submissions");
  revalidatePath("/dashboard");
  revalidatePath("/orders/new");
  return { ok: true, data: { submissionId: data.id } };
}
