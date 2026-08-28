"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  ITEM_CATEGORIES,
  ITEM_UNITS,
  type ItemCategory,
  type ItemUnit,
} from "@/lib/constants/enums";
import { ITEM_CATEGORY_LABEL, ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import type { Item } from "@/lib/db/items";
import { IDLE_FORM_STATE } from "@/lib/forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ImageUploadField } from "@/components/patterns/image-upload-field";
import {
  createItemAction,
  updateItemAction,
} from "@/app/(app)/admin/items/actions";

export function ItemForm({ item }: { item?: Item }) {
  const isEdit = Boolean(item);
  const [state, formAction, pending] = useActionState(
    isEdit ? updateItemAction : createItemAction,
    IDLE_FORM_STATE,
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="flex max-w-2xl flex-col gap-6"
      noValidate
    >
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

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
          defaultValue={item?.name ?? ""}
          aria-invalid={Boolean(errors.name)}
        />
      </Field>

      <ImageUploadField defaultUrl={item?.image_url ?? ""} />
      {errors.imageUrl ? (
        <p className="-mt-4 text-xs text-tone-error-fg">{errors.imageUrl}</p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Category"
          htmlFor="category"
          required
          error={errors.category}
        >
          <Select
            name="category"
            defaultValue={
              (item?.category as ItemCategory | undefined) ?? "OTHER"
            }
          >
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {ITEM_CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Unit" htmlFor="unit" required error={errors.unit}>
          <Select
            name="unit"
            defaultValue={(item?.unit as ItemUnit | undefined) ?? "UNIT"}
          >
            <SelectTrigger id="unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {ITEM_UNIT_LABEL[u]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Price"
          htmlFor="price"
          required
          error={errors.price}
          hint="In-game currency."
        >
          <Input
            id="price"
            name="price"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            defaultValue={item ? String(item.price) : ""}
            aria-invalid={Boolean(errors.price)}
          />
        </Field>

        <Field
          label="Low-stock threshold"
          htmlFor="lowStockThreshold"
          error={errors.lowStockThreshold}
          hint="0 disables the alert."
        >
          <Input
            id="lowStockThreshold"
            name="lowStockThreshold"
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            defaultValue={item ? String(item.low_stock_threshold) : "0"}
            aria-invalid={Boolean(errors.lowStockThreshold)}
          />
        </Field>
      </div>

      <Field
        label="Code / SKU"
        htmlFor="sku"
        error={errors.sku}
        hint="Optional reference used in-game."
      >
        <Input id="sku" name="sku" defaultValue={item?.sku ?? ""} />
      </Field>

      <Field
        label="Description"
        htmlFor="description"
        error={errors.description}
      >
        <Textarea
          id="description"
          name="description"
          defaultValue={item?.description ?? ""}
        />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">Availability</legend>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            name="active"
            defaultChecked={item ? item.active : true}
            value="on"
          />
          <span>
            <span className="font-medium">Active</span>
            <span className="block text-xs text-muted-foreground">
              Inactive items are hidden from members.
            </span>
          </span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            name="orderable"
            defaultChecked={item ? item.orderable : true}
            value="on"
          />
          <span>
            <span className="font-medium">Orderable</span>
            <span className="block text-xs text-muted-foreground">
              Members can add this to an order.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create item"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/items">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
