"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentMember, requireSuperAdmin } from "@/lib/auth/session";
import type { MemberStatus } from "@/lib/constants/enums";
import { fieldErrorsFrom, rpcErrorMessage, type FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  createMemberSchema,
  resetPasswordSchema,
  updateMemberSchema,
} from "@/lib/validation/member";

export type ActionResult = { ok: boolean; error?: string };

export async function createMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireSuperAdmin();

  const parsed = createMemberSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    username: formData.get("username"),
    displayName: formData.get("displayName"),
    rank: formData.get("rank"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const input = parsed.data;
  const admin = createAdminClient();

  const { data: created, error: authError } = await admin.auth.admin.createUser(
    {
      email: input.email,
      password: input.password,
      email_confirm: true,
    },
  );
  if (authError || !created.user) {
    return {
      ok: false,
      error: rpcErrorMessage(authError, "Could not create the account."),
    };
  }

  const { data: member, error: memberError } = await admin
    .from("members")
    .insert({
      user_id: created.user.id,
      username: input.username,
      display_name: input.displayName,
      rank: input.rank,
      role: input.role,
      status: "ACTIVE",
    })
    .select("id")
    .single();

  if (memberError || !member) {
    await admin.auth.admin.deleteUser(created.user.id);
    const duplicate = /duplicate key|unique/i.test(memberError?.message ?? "");
    return {
      ok: false,
      error: duplicate
        ? "That username is already taken."
        : "Could not create the member profile.",
    };
  }

  await admin.from("activity_logs").insert({
    actor_id: actor.id,
    verb: "member.created",
    summary: `Added member ${input.displayName}`,
    reference_type: "MEMBER",
    reference_id: member.id,
  });
  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "MEMBER_CREATED",
    entity_type: "member",
    entity_id: member.id,
    new_values: {
      username: input.username,
      display_name: input.displayName,
      rank: input.rank,
      role: input.role,
    },
  });

  revalidatePath("/admin/members");
  redirect("/admin/members");
}

export async function updateMemberAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireSuperAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || id === "") {
    return { ok: false, error: "Missing member reference." };
  }

  const parsed = updateMemberSchema.safeParse({
    displayName: formData.get("displayName"),
    rank: formData.get("rank"),
    role: formData.get("role"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }
  const input = parsed.data;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("members")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Member not found." };

  if (
    existing.user_id === actor.user_id &&
    (input.status !== "ACTIVE" || input.role !== "SUPER_ADMIN")
  ) {
    return {
      ok: false,
      error: "You can't remove your own admin access or deactivate yourself.",
    };
  }

  const { error } = await admin
    .from("members")
    .update({
      display_name: input.displayName,
      rank: input.rank,
      role: input.role,
      status: input.status,
    })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not save the member." };

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "MEMBER_UPDATED",
    entity_type: "member",
    entity_id: id,
    old_values: {
      display_name: existing.display_name,
      rank: existing.rank,
      role: existing.role,
      status: existing.status,
    },
    new_values: {
      display_name: input.displayName,
      rank: input.rank,
      role: input.role,
      status: input.status,
    },
  });

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${id}`);
  redirect(`/admin/members/${id}` as Route);
}

export async function setMemberStatusAction(
  id: string,
  status: MemberStatus,
): Promise<ActionResult> {
  const actor = await requireSuperAdmin();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("members")
    .select("user_id, display_name, status")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Member not found." };
  if (existing.user_id === actor.user_id && status === "INACTIVE") {
    return { ok: false, error: "You can't deactivate yourself." };
  }
  if (existing.status === status) return { ok: true };

  const { error } = await admin.from("members").update({ status }).eq("id", id);
  if (error) return { ok: false, error: "Could not update the member." };

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: status === "INACTIVE" ? "MEMBER_DEACTIVATED" : "MEMBER_REACTIVATED",
    entity_type: "member",
    entity_id: id,
    old_values: { status: existing.status },
    new_values: { status },
  });
  await admin.from("activity_logs").insert({
    actor_id: actor.id,
    verb: status === "INACTIVE" ? "member.deactivated" : "member.reactivated",
    summary: `${status === "INACTIVE" ? "Deactivated" : "Reactivated"} ${existing.display_name}`,
    reference_type: "MEMBER",
    reference_id: id,
  });

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${id}`);
  return { ok: true };
}

export async function resetMemberPasswordAction(
  id: string,
  newPassword: string,
  confirmPassword: string,
): Promise<ActionResult> {
  const actor = await requireSuperAdmin();

  const parsed = resetPasswordSchema.safeParse({
    newPassword,
    confirmPassword,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the password.",
    };
  }

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("user_id, display_name")
    .eq("id", id)
    .maybeSingle();
  if (!member) return { ok: false, error: "Member not found." };

  const { error } = await admin.auth.admin.updateUserById(member.user_id, {
    password: parsed.data.newPassword,
  });
  if (error) {
    return { ok: false, error: "Could not reset the password." };
  }

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "MEMBER_PASSWORD_RESET",
    entity_type: "member",
    entity_id: id,
    new_values: { reset_by: actor.id },
  });

  return { ok: true };
}

// Referenced by the profile page so member self-service lives in one place.
export async function updateOwnDisplayNameAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const member = await getCurrentMember();
  if (!member) redirect("/login");

  const value = formData.get("displayName");
  const displayName = typeof value === "string" ? value.trim() : "";
  if (displayName.length < 1 || displayName.length > 80) {
    return { ok: false, fieldErrors: { displayName: "Enter 1–80 characters" } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ display_name: displayName })
    .eq("id", member.id);
  if (error) return { ok: false, error: "Could not update your name." };

  revalidatePath("/profile");
  return { ok: true };
}
