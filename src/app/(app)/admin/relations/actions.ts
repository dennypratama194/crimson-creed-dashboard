"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/session";
import { fieldErrorsFrom, rpcErrorMessage, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { parseRelationForm } from "@/lib/validation/relation";

export async function createRelationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperAdmin();

  const parsed = parseRelationForm(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const relation = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_relation", {
    p_name: relation.name,
    p_joined_on: relation.joinedOn,
    p_notes: relation.notes,
    p_handler_member_id: relation.handlerMemberId,
    p_metal_scrap_settled: relation.metalScrapSettled,
    p_oath_date: relation.oathDate,
    p_blood_oath: relation.bloodOath,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not add the relation."),
    };
  }

  revalidatePath("/admin/relations");
  return { ok: true };
}

export async function updateRelationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id === "") {
    return { ok: false, error: "Missing relation reference." };
  }

  const parsed = parseRelationForm(formData);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const relation = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_relation", {
    p_relation_id: id,
    p_name: relation.name,
    p_joined_on: relation.joinedOn,
    p_notes: relation.notes,
    p_handler_member_id: relation.handlerMemberId,
    p_metal_scrap_settled: relation.metalScrapSettled,
    p_oath_date: relation.oathDate,
    p_blood_oath: relation.bloodOath,
  });

  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not save the relation."),
    };
  }

  revalidatePath("/admin/relations");
  revalidatePath(`/admin/relations/${id}/edit`);
  return { ok: true };
}
