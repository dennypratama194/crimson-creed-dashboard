"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { ITEM_CATEGORIES } from "@/lib/constants/enums";
import { ITEM_CATEGORY_LABEL, ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import type { OrderableItem } from "@/lib/db/orders";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ItemThumb } from "@/components/patterns/item-thumb";
import { createOrderAction } from "@/app/(app)/orders/actions";

type Line = { key: string; itemId: string; quantity: string };

export function OrderBuilder({ items }: { items: OrderableItem[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [addValue, setAddValue] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );
  const usedIds = new Set(lines.map((l) => l.itemId));
  const available = items.filter((i) => !usedIds.has(i.id));

  const estimatedTotal = lines.reduce((sum, line) => {
    const item = itemsById.get(line.itemId);
    const qty = Number(line.quantity);
    if (!item || !Number.isFinite(qty) || qty <= 0) return sum;
    return sum + item.price * qty;
  }, 0);

  function addLine(itemId: string) {
    setLines((prev) => [
      ...prev,
      { key: crypto.randomUUID(), itemId, quantity: "1" },
    ]);
    setAddValue(undefined);
    setError(null);
  }

  function updateQuantity(key: string, value: string) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: value } : l)),
    );
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function submit() {
    setError(null);

    if (lines.length === 0) {
      setError("Add at least one item.");
      return;
    }
    const payloadItems = lines.map((l) => ({
      item_id: l.itemId,
      quantity: Number(l.quantity),
    }));
    if (
      payloadItems.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)
    ) {
      setError("Every line needs a whole quantity greater than zero.");
      return;
    }

    startTransition(async () => {
      const result = await createOrderAction({
        items: payloadItems,
        note: note.trim() || null,
      });
      if (!result.ok || !result.data) {
        setError(result.error ?? "Could not place the order.");
        return;
      }
      router.push(`/orders/${result.data.orderId}`);
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="add-item">Add an item</Label>
        <Select
          value={addValue}
          onValueChange={(v) => {
            setAddValue(v);
            addLine(v);
          }}
        >
          <SelectTrigger
            id="add-item"
            className="sm:w-80"
            disabled={available.length === 0}
          >
            <SelectValue
              placeholder={
                available.length === 0
                  ? "Everything available is in the order"
                  : "Choose an item…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {ITEM_CATEGORIES.map((category) => {
              const inCategory = available.filter(
                (i) => i.category === category,
              );
              if (inCategory.length === 0) return null;
              return (
                <SelectGroup key={category}>
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                    {ITEM_CATEGORY_LABEL[category]}
                  </div>
                  {inCategory.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <span className="flex items-center gap-2">
                        <ItemThumb
                          src={item.image_url}
                          name={item.name}
                          size="sm"
                        />
                        {item.name} — {formatMoney(item.price)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {lines.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs text-muted-foreground uppercase">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">Unit price</th>
                <th className="px-4 py-2 font-medium">Quantity</th>
                <th className="px-4 py-2 text-right font-medium">Line total</th>
                <th className="px-4 py-2">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const item = itemsById.get(line.itemId);
                if (!item) return null;
                const qty = Number(line.quantity);
                const lineTotal =
                  Number.isFinite(qty) && qty > 0 ? item.price * qty : 0;
                return (
                  <tr key={line.key} className="border-t border-border">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <ItemThumb
                          src={item.image_url}
                          name={item.name}
                          size="sm"
                        />
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            per {ITEM_UNIT_LABEL[item.unit].toLowerCase()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMoney(item.price)}
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={line.quantity}
                        onChange={(e) =>
                          updateQuantity(line.key, e.target.value)
                        }
                        aria-label={`Quantity for ${item.name}`}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {formatMoney(lineTotal)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => removeLine(line.key)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40">
                <td colSpan={3} className="px-4 py-3 font-medium">
                  Estimated total
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatMoney(estimatedTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No items yet. Add one above.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything the org should know about this request."
          maxLength={500}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        The total is confirmed by the server when you submit and is locked to
        today&apos;s catalogue prices.
      </p>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending || lines.length === 0}>
          {pending ? "Placing order…" : "Place order"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => router.push("/orders")}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
