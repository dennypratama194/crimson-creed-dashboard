"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import type { MemberOption } from "@/lib/db/members";
import type { Relation } from "@/lib/db/relations";
import { IDLE_FORM_STATE } from "@/lib/forms";
import { useActionToast } from "@/lib/toast";
import { RELATION_METAL_SCRAP_QUANTITY } from "@/lib/constants/relations";
import { RELATION_HANDLER_NONE } from "@/lib/validation/relation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createRelationAction,
  updateRelationAction,
} from "@/app/(app)/admin/relations/actions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RelationForm({
  relation,
  members,
}: {
  relation?: Relation;
  members: MemberOption[];
}) {
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
        label="Person in charge"
        htmlFor="handlerMemberId"
        error={errors.handlerMemberId}
        hint="The member responsible for this relation."
      >
        <Select
          name="handlerMemberId"
          defaultValue={relation?.handler_member_id ?? RELATION_HANDLER_NONE}
        >
          <SelectTrigger id="handlerMemberId">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={RELATION_HANDLER_NONE}>
              No one assigned
            </SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Joined date"
          htmlFor="joinedOn"
          required
          error={errors.joinedOn}
          hint="When this relation joined. Backdate if needed."
        >
          <DatePicker
            id="joinedOn"
            name="joinedOn"
            max={today()}
            defaultValue={relation?.joined_on ?? today()}
            aria-invalid={Boolean(errors.joinedOn)}
          />
        </Field>

        <Field
          label="Oath date"
          htmlFor="oathDate"
          error={errors.oathDate}
          hint="Leave blank if no oath has been taken."
        >
          <DatePicker
            id="oathDate"
            name="oathDate"
            max={today()}
            defaultValue={relation?.oath_date ?? undefined}
            placeholder="No oath yet"
            aria-invalid={Boolean(errors.oathDate)}
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Status</legend>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            name="metalScrapSettled"
            defaultChecked={relation?.metal_scrap_settled ?? false}
            value="on"
          />
          <span>
            <span className="font-medium">Metal scrap settled</span>
            <span className="block text-xs text-muted-foreground">
              Adds {RELATION_METAL_SCRAP_QUANTITY} pcs of Metal Scrap to the
              company stash; clearing it removes them again.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            name="bloodOath"
            defaultChecked={relation?.blood_oath ?? false}
            value="on"
          />
          <span>
            <span className="font-medium">Blood oath taken</span>
          </span>
        </label>
      </fieldset>

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
