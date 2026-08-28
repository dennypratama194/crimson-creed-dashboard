"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/auth/session";
import { fieldErrorsFrom, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, signInSchema } from "@/lib/validation/auth";

const GENERIC_SIGNIN_ERROR = "That email and password did not match.";

export async function signIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { ok: false, error: GENERIC_SIGNIN_ERROR };
  }

  // Block sign-in for members who are not ACTIVE (PRD §4).
  const { data: member } = await supabase
    .from("members")
    .select("status")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!member || member.status !== "ACTIVE") {
    await supabase.auth.signOut();
    return {
      ok: false,
      error: "This account is inactive. Contact a Super Admin.",
    };
  }

  const next = parsed.data.next;
  const target: Route =
    next && next.startsWith("/") && !next.startsWith("//")
      ? (next as Route)
      : "/dashboard";
  redirect(target);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const parsed = changePasswordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.message ||
        "Could not update your password. Try again in a moment.",
    };
  }

  return { ok: true };
}
