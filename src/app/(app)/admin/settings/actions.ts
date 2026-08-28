"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/auth/session";
import { fieldErrorsFrom, rpcErrorMessage, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  orgName: z
    .string()
    .trim()
    .min(1, "Organization name is required")
    .max(80, "Name is too long"),
  logoUrl: z
    .string()
    .trim()
    .max(500, "URL is too long")
    .refine(
      (v) => v === "" || v.startsWith("http://") || v.startsWith("https://"),
      { message: "Enter an http(s) URL or leave it blank" },
    ),
});

export async function updateSettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperAdmin();

  const parsed = settingsSchema.safeParse({
    orgName: formData.get("orgName") ?? "",
    logoUrl: formData.get("logoUrl") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_organization_settings", {
    p_org_name: parsed.data.orgName,
    p_logo_url: parsed.data.logoUrl || null,
  });
  if (error) {
    return {
      ok: false,
      error: rpcErrorMessage(error, "Could not save settings."),
    };
  }

  revalidatePath("/admin/settings");
  return { ok: true };
}
