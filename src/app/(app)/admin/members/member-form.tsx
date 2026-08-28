"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  APP_ROLES,
  MEMBER_RANKS,
  MEMBER_STATUSES,
} from "@/lib/constants/enums";
import {
  APP_ROLE_LABEL,
  MEMBER_RANK_LABEL,
  MEMBER_STATUS_LABEL,
} from "@/lib/constants/labels";
import type { Member } from "@/lib/db/members";
import { IDLE_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createMemberAction,
  updateMemberAction,
} from "@/app/(app)/admin/members/actions";

export function MemberForm({ member }: { member?: Member }) {
  const isEdit = Boolean(member);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateMemberAction : createMemberAction,
    IDLE_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="flex max-w-xl flex-col gap-6"
      noValidate
    >
      {member ? <input type="hidden" name="id" value={member.id} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg"
        >
          {state.error}
        </p>
      ) : null}

      {!isEdit ? (
        <>
          <Field label="Email" htmlFor="email" required error={errors.email}>
            <Input id="email" name="email" type="email" autoComplete="off" />
          </Field>
          <Field
            label="Temporary password"
            htmlFor="password"
            required
            error={errors.password}
            hint="At least 8 characters. Share it with the member; they can change it later."
          >
            <Input
              id="password"
              name="password"
              type="text"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Username"
            htmlFor="username"
            required
            error={errors.username}
            hint="Lowercase letters, numbers and underscores. Cannot be changed later."
          >
            <Input id="username" name="username" autoComplete="off" />
          </Field>
        </>
      ) : null}

      <Field
        label="Display name"
        htmlFor="displayName"
        required
        error={errors.displayName}
      >
        <Input
          id="displayName"
          name="displayName"
          defaultValue={member?.display_name ?? ""}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Rank" htmlFor="rank" error={errors.rank}>
          <Select name="rank" defaultValue={member?.rank ?? "SOLDIER"}>
            <SelectTrigger id="rank">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBER_RANKS.map((r) => (
                <SelectItem key={r} value={r}>
                  {MEMBER_RANK_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Role"
          htmlFor="role"
          error={errors.role}
          hint="Super Admins can manage everything."
        >
          <Select name="role" defaultValue={member?.role ?? "MEMBER"}>
            <SelectTrigger id="role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {APP_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {APP_ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {isEdit ? (
        <Field label="Status" htmlFor="status" error={errors.status}>
          <Select name="status" defaultValue={member?.status ?? "ACTIVE"}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {MEMBER_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create member"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/members">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
