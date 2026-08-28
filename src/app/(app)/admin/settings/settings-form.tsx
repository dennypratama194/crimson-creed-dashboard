"use client";

import { useActionState } from "react";

import type { OrganizationSettings } from "@/lib/db/settings";
import { IDLE_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateSettingsAction } from "@/app/(app)/admin/settings/actions";

export function SettingsForm({ settings }: { settings: OrganizationSettings }) {
  const [state, formAction, pending] = useActionState(
    updateSettingsAction,
    IDLE_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="flex max-w-lg flex-col gap-6"
      noValidate
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
          Settings saved.
        </p>
      ) : null}

      <Field
        label="Organization name"
        htmlFor="orgName"
        required
        error={errors.orgName}
      >
        <Input id="orgName" name="orgName" defaultValue={settings.org_name} />
      </Field>

      <Field
        label="Logo URL"
        htmlFor="logoUrl"
        error={errors.logoUrl}
        hint="Optional. A link to a hosted image."
      >
        <Input
          id="logoUrl"
          name="logoUrl"
          type="url"
          defaultValue={settings.logo_url ?? ""}
          placeholder="https://…"
        />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
