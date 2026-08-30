"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import { fieldErrorsFrom, rpcErrorMessage, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import {
  parseSupplierForm,
  parseSupplierItemForm,
} from "@/lib/validation/supplier";

export async function createSupplierAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperAdmin();

  const parsed = parseSupplierForm(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supplier = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_supplier", {
    p_name: supplier.name,
    p_code: supplier.code,
    p_contact: supplier.contact,
    p_notes: supplier.notes,
    p_active: supplier.active,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not create the supplier."),
    };
  }

  revalidatePath("/admin/suppliers");
  return { ok: true };
}

export async function updateSupplierAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id === "") {
    return { ok: false, error: "Missing supplier reference." };
  }

  const parsed = parseSupplierForm(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supplier = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_supplier", {
    p_supplier_id: id,
    p_name: supplier.name,
    p_code: supplier.code,
    p_contact: supplier.contact,
    p_notes: supplier.notes,
    p_active: supplier.active,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not save the supplier."),
    };
  }

  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${id}`);
  return { ok: true };
}

export async function archiveSupplierAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_supplier", {
    p_supplier_id: id,
  });
  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not archive the supplier."),
    };
  }
  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${id}`);
  return { ok: true };
}

export async function restoreSupplierAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_supplier", {
    p_supplier_id: id,
  });
  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not restore the supplier."),
    };
  }
  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${id}`);
  return { ok: true };
}

export async function setSupplierItemAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperAdmin();

  const supplierId = formData.get("supplierId");
  if (typeof supplierId !== "string" || supplierId === "") {
    return { ok: false, error: "Missing supplier reference." };
  }

  const parsed = parseSupplierItemForm(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const line = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_supplier_item", {
    p_supplier_id: supplierId,
    p_item_id: line.itemId,
    p_buy_price: line.buyPrice,
    p_sell_price: line.sellPrice,
    p_max_quantity: line.maxQuantity,
    p_active: line.active,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not save the supplier item."),
    };
  }

  revalidatePath(`/admin/suppliers/${supplierId}`);
  revalidatePath("/admin/suppliers");
  return { ok: true };
}

export async function removeSupplierItemAction(
  supplierItemId: string,
  supplierId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_supplier_item", {
    p_supplier_item_id: supplierItemId,
  });
  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not remove the supplier item."),
    };
  }
  revalidatePath(`/admin/suppliers/${supplierId}`);
  revalidatePath("/admin/suppliers");
  return { ok: true };
}
