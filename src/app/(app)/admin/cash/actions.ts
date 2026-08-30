"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  recordCashEntrySchema,
  reverseCashEntrySchema,
} from "@/lib/validation/cash";

export type ActionResult<T = undefined> = {
  ok: boolean;
  error?: string;
  data?: T;
};

export async function recordCashEntryAction(
  input: unknown,
): Promise<ActionResult<{ entryId: string }>> {
  await requireSuperAdmin();

  const parsed = recordCashEntrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Check the entry and try again.",
    };
  }

  const {
    direction,
    amount,
    category,
    handledBy,
    occurredAt,
    note,
    allowNegative,
  } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_cash_entry", {
    p_direction: direction,
    p_amount: amount,
    p_category: category,
    p_occurred_at: occurredAt ? `${occurredAt}T00:00:00Z` : null,
    p_note: note?.trim() ? note.trim() : null,
    p_allow_negative: allowNegative ?? false,
    p_handled_by: handledBy,
  });

  if (error || !data) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not record the entry."),
    };
  }

  revalidatePath("/admin/cash");
  revalidatePath("/dashboard");
  return { ok: true, data: { entryId: data.id } };
}

export async function reverseCashEntryAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = reverseCashEntrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Enter a reason and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_cash_entry", {
    p_entry_id: parsed.data.entryId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not reverse the entry."),
    };
  }

  revalidatePath("/admin/cash");
  revalidatePath(`/admin/cash/${parsed.data.entryId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
