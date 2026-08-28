"use client";

import { useActionState } from "react";

import { changePassword } from "@/lib/auth/actions";
import { IDLE_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePassword,
    IDLE_FORM_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex max-w-sm flex-col gap-4"
      noValidate
      key={state.ok ? "done" : "editing"}
    >
      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg"
        >
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-md border border-tone-success-border bg-tone-success-bg px-3 py-2 text-sm text-tone-success-fg">
          Password changed.
        </p>
      ) : null}

      <Field
        label="New password"
        htmlFor="newPassword"
        error={state.fieldErrors?.newPassword}
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
        />
      </Field>
      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        error={state.fieldErrors?.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
        />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Updating…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
