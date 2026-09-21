"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useMemo, useState } from "react";

import { ITEM_CATEGORY_LABEL } from "@/lib/constants/labels";
import type { PickerItem, SupplierCatalogueLine } from "@/lib/db/suppliers";
import { formatMoney, formatQuantity } from "@/lib/format";
import { IDLE_FORM_STATE } from "@/lib/forms";
import { useActionToast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { EmptyState } from "@/components/patterns/empty-state";
import { ItemThumb } from "@/components/patterns/item-thumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  removeSupplierItemAction,
  setSupplierItemAction,
} from "@/app/(app)/admin/suppliers/actions";

type DialogState =
  { mode: "add" } | { mode: "edit"; line: SupplierCatalogueLine } | null;

export function SupplierCatalogueEditor({
  supplierId,
  supplierArchived,
  lines,
  pickerItems,
}: {
  supplierId: string;
  supplierArchived: boolean;
  lines: SupplierCatalogueLine[];
  pickerItems: PickerItem[];
}) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const listedItemIds = useMemo(
    () => new Set(lines.map((l) => l.item_id)),
    [lines],
  );
  const availableItems = useMemo(
    () => pickerItems.filter((i) => !listedItemIds.has(i.id)),
    [pickerItems, listedItemIds],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Price book</h2>
        {!supplierArchived ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setDialog({ mode: "add" })}
            disabled={availableItems.length === 0}
          >
            <Plus aria-hidden />
            Add item
          </Button>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <EmptyState
          title="Nothing listed"
          description={
            supplierArchived
              ? "This supplier is archived."
              : "Add the items this supplier carries and what they cost."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>
                <span>Buy</span>
              </TableHead>
              <TableHead>
                <span>Sell</span>
              </TableHead>
              <TableHead>
                <span>Max / order</span>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <ItemThumb
                      src={line.item.image_url}
                      name={line.item.name}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="font-medium">{line.item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {ITEM_CATEGORY_LABEL[line.item.category]}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(line.buy_price)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {line.sell_price === null
                    ? "—"
                    : formatMoney(line.sell_price)}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {line.max_quantity === null
                    ? "—"
                    : formatQuantity(line.max_quantity)}
                </TableCell>
                <TableCell>
                  {line.active ? (
                    <Badge tone="success">Active</Badge>
                  ) : (
                    <Badge tone="warning">Disabled</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ mode: "edit", line })}
                      disabled={supplierArchived}
                    >
                      <Pencil aria-hidden />
                      Edit
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Trash2 aria-hidden />
                          Remove
                        </Button>
                      }
                      title={`Remove "${line.item.name}"?`}
                      description="It stops being listed for this supplier. The catalogue item itself is untouched."
                      confirmLabel="Remove"
                      destructive
                      successMessage={`"${line.item.name}" removed.`}
                      onConfirm={async () => {
                        const res = await removeSupplierItemAction(
                          line.id,
                          supplierId,
                        );
                        return res;
                      }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(next) => {
          if (!next) setDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          {dialog ? (
            <SupplierItemDialogBody
              key={dialog.mode === "edit" ? dialog.line.id : "add"}
              supplierId={supplierId}
              dialog={dialog}
              availableItems={availableItems}
              onDone={() => {
                setDialog(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SupplierItemDialogBody({
  supplierId,
  dialog,
  availableItems,
  onDone,
}: {
  supplierId: string;
  dialog: Exclude<DialogState, null>;
  availableItems: PickerItem[];
  onDone: () => void;
}) {
  const isEdit = dialog.mode === "edit";
  const line = isEdit ? dialog.line : null;

  const [state, formAction, pending] = useActionState(
    setSupplierItemAction,
    IDLE_FORM_STATE,
  );
  useActionToast(state, {
    success: isEdit ? "Line updated." : "Item listed.",
    onSuccess: onDone,
  });
  const errors = state.fieldErrors ?? {};

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? `Edit ${line!.item.name}` : "Add item to this supplier"}
        </DialogTitle>
      </DialogHeader>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="supplierId" value={supplierId} />

        {state.error ? (
          <p
            role="alert"
            className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg"
          >
            {state.error}
          </p>
        ) : null}

        {isEdit ? (
          <input type="hidden" name="itemId" value={line!.item_id} />
        ) : (
          <Field label="Item" htmlFor="itemId" required error={errors.itemId}>
            <Select name="itemId">
              <SelectTrigger id="itemId">
                <SelectValue placeholder="Choose an item" />
              </SelectTrigger>
              <SelectContent>
                {availableItems.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} · {ITEM_CATEGORY_LABEL[i.category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Buy price"
            htmlFor="buyPrice"
            required
            error={errors.buyPrice}
          >
            <Input
              id="buyPrice"
              name="buyPrice"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={line ? String(line.buy_price) : ""}
              aria-invalid={Boolean(errors.buyPrice)}
            />
          </Field>

          <Field
            label="Sell price"
            htmlFor="sellPrice"
            error={errors.sellPrice}
            hint="Blank = not sold to members."
          >
            <Input
              id="sellPrice"
              name="sellPrice"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              defaultValue={
                line?.sell_price != null ? String(line.sell_price) : ""
              }
              aria-invalid={Boolean(errors.sellPrice)}
            />
          </Field>
        </div>

        <Field
          label="Max per order"
          htmlFor="maxQuantity"
          error={errors.maxQuantity}
          hint="Reference only — not enforced on member orders."
        >
          <Input
            id="maxQuantity"
            name="maxQuantity"
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            defaultValue={
              line?.max_quantity != null ? String(line.max_quantity) : ""
            }
            aria-invalid={Boolean(errors.maxQuantity)}
          />
        </Field>

        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            name="active"
            defaultChecked={line ? line.active : true}
            value="on"
          />
          <span>
            <span className="font-medium">Active</span>
            <span className="block text-xs text-muted-foreground">
              Uncheck to keep the line but mark it dormant.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save" : "Add item"}
          </Button>
        </div>
      </form>
    </>
  );
}
