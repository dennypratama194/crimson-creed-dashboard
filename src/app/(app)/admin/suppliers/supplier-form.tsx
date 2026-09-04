"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";

import type { Supplier } from "@/lib/db/suppliers";
import { IDLE_FORM_STATE } from "@/lib/forms";
import { useActionToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createSupplierAction,
  updateSupplierAction,
} from "@/app/(app)/admin/suppliers/actions";

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const router = useRouter();
  const isEdit = Boolean(supplier);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateSupplierAction : createSupplierAction,
    IDLE_FORM_STATE,
  );
  useActionToast(state, {
    success: isEdit ? "Supplier saved." : "Supplier created.",
    onSuccess: () =>
      router.push(
        isEdit ? `/admin/suppliers/${supplier!.id}` : "/admin/suppliers",
      ),
  });
  const errors = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="flex max-w-2xl flex-col gap-6"
      noValidate
    >
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}

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
          defaultValue={supplier?.name ?? ""}
          aria-invalid={Boolean(errors.name)}
        />
      </Field>

      <Field
        label="Contact"
        htmlFor="contact"
        error={errors.contact}
        hint="Optional — in-game contact or channel."
      >
        <Input
          id="contact"
          name="contact"
          defaultValue={supplier?.contact ?? ""}
        />
      </Field>

      <Field label="Notes" htmlFor="notes" error={errors.notes}>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={supplier?.notes ?? ""}
        />
      </Field>

      <label className="flex items-center gap-3 text-sm">
        <Checkbox
          name="active"
          defaultChecked={supplier ? supplier.active : true}
          value="on"
        />
        <span>
          <span className="font-medium">Active</span>
          <span className="block text-xs text-muted-foreground">
            Inactive suppliers stay in the catalogue but are flagged as dormant.
          </span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create supplier"}
        </Button>
        <Button variant="ghost" asChild>
          <Link
            href={
              isEdit ? `/admin/suppliers/${supplier!.id}` : "/admin/suppliers"
            }
          >
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
