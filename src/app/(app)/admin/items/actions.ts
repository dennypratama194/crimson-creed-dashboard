"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireSuperAdmin } from "@/lib/auth/session";
import { fieldErrorsFrom, rpcErrorMessage, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { parseItemForm } from "@/lib/validation/item";

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
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not create the item."),
    };
  }

  revalidatePath("/admin/items");
  redirect("/admin/items");
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
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not save the item."),
    };
  }

  revalidatePath("/admin/items");
  redirect("/admin/items");
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
  revalidatePath("/admin/items");
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
  revalidatePath("/admin/items");
  return { ok: true };
}
