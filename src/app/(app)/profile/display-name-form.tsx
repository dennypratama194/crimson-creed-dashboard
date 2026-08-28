"use client";

import { useActionState } from "react";

import { IDLE_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateOwnDisplayNameAction } from "@/app/(app)/admin/members/actions";

export function DisplayNameForm({ current }: { current: string }) {
  const [state, formAction, pending] = useActionState(
    updateOwnDisplayNameAction,
    IDLE_FORM_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex max-w-sm flex-col gap-4"
      noValidate
    >
      {state.error ? (
        <p className="text-sm text-tone-error-fg">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-tone-success-fg">Name updated.</p>
      ) : null}
      <Field
        label="Display name"
        htmlFor="displayName"
        error={state.fieldErrors?.displayName}
      >
        <Input id="displayName" name="displayName" defaultValue={current} />
      </Field>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
