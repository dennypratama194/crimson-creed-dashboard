"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import { rpcErrorMessage } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  createProductionProductSchema,
  reviewProductionLogSchema,
  setProductionRateSchema,
} from "@/lib/validation/production";

export type ActionResult = { ok: boolean; error?: string };

export async function createProductionProductAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = createProductionProductSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the details and retry.",
    };
  }

  const { name, unit, unitRate } = parsed.data;
  const supabase = await createClient();

  // A production "product" is just a PRODUCT-category item. Create it not
  // orderable / zero price — those are managed on the Items page if the org
  // also sells it — then attach the pay rate.
  const { data: item, error: itemError } = await supabase.rpc("create_item", {
    p_name: name,
    p_category: "PRODUCT",
    p_unit: unit,
    p_price: 0,
    p_orderable: false,
    p_active: true,
  });

  if (itemError || !item) {
    return {
      ok: false,
      error: rpcErrorMessage(itemError, "Could not create the product."),
    };
  }

  const { error: rateError } = await supabase.rpc("set_production_rate", {
    p_item_id: item.id,
    p_unit_rate: unitRate,
  });

  if (rateError) {
    return {
      ok: false,
      error: rpcErrorMessage(
        rateError,
        "Product created, but the pay rate did not save. Set it on the row.",
      ),
    };
  }

  revalidatePath("/admin/production/rates");
  revalidatePath("/admin/items");
  revalidatePath("/production");
  return { ok: true };
}

export async function setProductionRateAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = setProductionRateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the rate and try again.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_production_rate", {
    p_item_id: parsed.data.itemId,
    p_unit_rate: parsed.data.unitRate,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not save the pay rate."),
    };
  }

  revalidatePath("/admin/production/rates");
  revalidatePath("/production");
  return { ok: true };
}

export async function reviewProductionLogAction(
  input: unknown,
): Promise<ActionResult> {
  await requireSuperAdmin();

  const parsed = reviewProductionLogSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the review and retry.",
    };
  }

  const { logId, approve, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_production_log", {
    p_log_id: logId,
    p_approve: approve,
    p_note: note?.trim() ? note.trim() : null,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not record the review."),
    };
  }

  revalidatePath("/admin/production/logs");
  return { ok: true };
}
