"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import type { Relation } from "@/lib/db/relations";
import { IDLE_FORM_STATE } from "@/lib/forms";
import { useActionToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createRelationAction,
  updateRelationAction,
} from "@/app/(app)/admin/relations/actions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RelationForm({ relation }: { relation?: Relation }) {
  const router = useRouter();
  const isEdit = Boolean(relation);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateRelationAction : createRelationAction,
    IDLE_FORM_STATE,
  );
  useActionToast(state, {
    success: isEdit ? "Relation saved." : "Relation added.",
    onSuccess: () => router.push("/admin/relations"),
  });
  const errors = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="flex max-w-2xl flex-col gap-6"
      noValidate
    >
      {relation ? <input type="hidden" name="id" value={relation.id} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg"
        >
          {state.error}
        </p>
      ) : null}

      <Field label="Name" htmlFor="name" required error={errors.name}>
        <Input
          id="name"
          name="name"
          defaultValue={relation?.name ?? ""}
          aria-invalid={Boolean(errors.name)}
        />
      </Field>

      <Field
        label="Joined date"
        htmlFor="joinedOn"
        required
        error={errors.joinedOn}
        hint="When this relation joined. Backdate if needed."
      >
        <Input
          id="joinedOn"
          name="joinedOn"
          type="date"
          max={today()}
          defaultValue={relation?.joined_on ?? today()}
          aria-invalid={Boolean(errors.joinedOn)}
        />
      </Field>

      <Field
        label="Notes"
        htmlFor="notes"
        error={errors.notes}
        hint="Optional."
      >
        <Textarea
          id="notes"
          name="notes"
          defaultValue={relation?.notes ?? ""}
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add relation"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/relations">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
