"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import {
  itemDeleteImpact,
  parseRpcPayload,
  type ItemDeleteImpact,
} from "@/lib/db/contracts";
import { ORDERABLE_ITEMS_CACHE_TAG } from "@/lib/db/orders";
import { fieldErrorsFrom, rpcErrorMessage, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { parseItemForm } from "@/lib/validation/item";

/** Paths + the cached-catalogue tag every item write needs to refresh. */
function revalidateItemViews() {
  revalidatePath("/admin/items");
  revalidatePath("/admin/inventory");
  // `{ expire: 0 }` = drop it now, so the next /orders/new load rebuilds the
  // catalogue rather than serving a stale copy.
  revalidateTag(ORDERABLE_ITEMS_CACHE_TAG, { expire: 0 });
}

export async function createItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperAdmin();

  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const item = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_item", {
    p_name: item.name,
    p_category: item.category,
    p_unit: item.unit,
    p_price: item.price,
    p_description: item.description,
    p_sku: item.sku,
    p_low_stock_threshold: item.lowStockThreshold,
    p_orderable: item.orderable,
    p_active: item.active,
    p_image_url: item.imageUrl,
    p_stock_type: item.stockType,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not create the item."),
    };
  }

  revalidateItemViews();
  return { ok: true };
}

export async function updateItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id === "") {
    return { ok: false, error: "Missing item reference." };
  }

  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const item = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_item", {
    p_item_id: id,
    p_name: item.name,
    p_category: item.category,
    p_unit: item.unit,
    p_price: item.price,
    p_description: item.description,
    p_sku: item.sku,
    p_low_stock_threshold: item.lowStockThreshold,
    p_orderable: item.orderable,
    p_active: item.active,
    p_image_url: item.imageUrl,
    p_stock_type: item.stockType,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not save the item."),
    };
  }

  revalidateItemViews();
  return { ok: true };
}

export async function archiveItemAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_item", { p_item_id: id });
  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not archive the item."),
    };
  }
  revalidateItemViews();
  return { ok: true };
}

/**
 * Advisory preview of what a permanent delete would destroy or refuse.
 *
 * It is NOT an authorization decision and NOT a precondition: `delete_item`
 * re-checks every blocker itself, under a row lock, and never sees these
 * numbers. A preview that is a few seconds stale can only mislead the operator
 * about counts — it can never let a blocked delete through.
 */
export async function getItemDeleteImpactAction(
  id: string,
): Promise<
  { ok: true; impact: ItemDeleteImpact } | { ok: false; error: string }
> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("item_delete_impact", {
    p_item_id: id,
  });
  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not check this item."),
    };
  }
  try {
    return {
      ok: true,
      impact: parseRpcPayload(itemDeleteImpact, data, "item_delete_impact"),
    };
  } catch {
    return { ok: false, error: "Could not check this item." };
  }
}

/**
 * Hard delete. The RPC refuses when anything references the item and names the
 * blockers, so the caller gets a real reason rather than a constraint error.
 *
 * Owner-approved exception to "nothing referenced historically is ever hard
 * deleted" — see CLAUDE.md. Recovery from a mistake here is a database restore,
 * not an undo: the audit row records that the history was destroyed and how
 * much of it there was, which is not the same as keeping it.
 */
export async function deleteItemAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_item", { p_item_id: id });
  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not delete the item."),
    };
  }
  revalidateItemViews();
  return { ok: true };
}

export async function restoreItemAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_item", { p_item_id: id });
  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not restore the item."),
    };
  }
  revalidateItemViews();
  return { ok: true };
}
