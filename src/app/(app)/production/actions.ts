"use server";

import { revalidatePath } from "next/cache";

import { requireActiveMember } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { submitProductionLogSchema } from "@/lib/validation/production";

export type ActionResult<T = undefined> = {
  ok: boolean;
  error?: string;
  data?: T;
};

export async function submitProductionLogAction(
  input: unknown,
): Promise<ActionResult<{ logId: string }>> {
  await requireActiveMember();

  const parsed = submitProductionLogSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Check the entry and try again.",
    };
  }

  const { itemId, quantity, occurredAt, note } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_production_log", {
    p_item_id: itemId,
    p_quantity: quantity,
    p_occurred_at: occurredAt ? `${occurredAt}T12:00:00Z` : null,
    p_note: note ?? null,
  });

  if (error || !data) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not log the production."),
    };
  }

  revalidatePath("/production");
  return { ok: true, data: { logId: data.id } };
}

export async function cancelProductionLogAction(
  logId: string,
): Promise<ActionResult> {
  await requireActiveMember();

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_production_log", {
    p_log_id: logId,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not cancel the log."),
    };
  }

  revalidatePath("/production");
  return { ok: true };
}
