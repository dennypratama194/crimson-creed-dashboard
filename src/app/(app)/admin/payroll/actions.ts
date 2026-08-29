"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { createPayrollRunSchema } from "@/lib/validation/production";

export type ActionResult<T = undefined> = {
  ok: boolean;
  error?: string;
  data?: T;
};

export async function createPayrollRunAction(
  input: unknown,
): Promise<ActionResult<{ runId: string }>> {
  await requireSuperAdmin();

  const parsed = createPayrollRunSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Check the dates and try again.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_payroll_run", {
    p_period_start: parsed.data.periodStart,
    p_period_end: parsed.data.periodEnd,
    p_note: parsed.data.note ?? null,
  });

  if (error || !data) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not open the payroll run."),
    };
  }

  revalidatePath("/admin/payroll");
  return { ok: true, data: { runId: data.id } };
}

export async function finalizePayrollRunAction(
  runId: string,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_payroll_run", {
    p_run_id: runId,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not finalize the run."),
    };
  }

  revalidatePath("/admin/payroll");
  revalidatePath(`/admin/payroll/${runId}`);
  revalidatePath("/production");
  return { ok: true };
}

export async function markPayrollRunPaidAction(
  runId: string,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_payroll_run_paid", {
    p_run_id: runId,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not mark the run paid."),
    };
  }

  revalidatePath("/admin/payroll");
  revalidatePath(`/admin/payroll/${runId}`);
  revalidatePath("/production");
  return { ok: true };
}
