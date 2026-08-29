"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Minus, Package, Plus, Search, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { ITEM_CATEGORIES } from "@/lib/constants/enums";
import type { ItemCategory } from "@/lib/constants/enums";
import { ITEM_CATEGORY_LABEL, ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import type { OrderableItem } from "@/lib/db/orders";
import { formatMoney } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { createOrderAction } from "@/app/(app)/orders/actions";

type Line = { key: string; itemId: string; quantity: string };
type CategoryFilter = ItemCategory | "ALL";

const MAX_QTY = 9999;

function qtyValue(quantity: string): number {
  const n = Number.parseInt(quantity, 10);
  return Number.isFinite(n) ? n : 0;
}

export function OrderBuilder({ items }: { items: OrderableItem[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );
  const lineByItem = useMemo(
    () => new Map(lines.map((l) => [l.itemId, l])),
    [lines],
  );

  const activeCategories = useMemo(
    () => ITEM_CATEGORIES.filter((c) => items.some((i) => i.category === c)),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category !== "ALL" && i.category !== category) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, search, category]);

  const estimatedTotal = lines.reduce((sum, line) => {
    const item = itemsById.get(line.itemId);
    const qty = qtyValue(line.quantity);
    if (!item || qty <= 0) return sum;
    return sum + item.price * qty;
  }, 0);

  function addItem(itemId: string) {
    setError(null);
    setLines((prev) => [
      ...prev,
      { key: crypto.randomUUID(), itemId, quantity: "1" },
    ]);
  }

  function setQuantity(itemId: string, value: string) {
    const clean = value.replace(/[^\d]/g, "").slice(0, 4);
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, quantity: clean } : l)),
    );
  }

  function stepQuantity(itemId: string, delta: number) {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.itemId !== itemId) return [l];
        const next = qtyValue(l.quantity) + delta;
        if (next < 1) return [];
        return [{ ...l, quantity: String(Math.min(MAX_QTY, next)) }];
      }),
    );
  }

  function removeItem(itemId: string) {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
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
        const message = result.error ?? "Could not place the order.";
        setError(message);
        toast.error(message);
        return;
      }
      toast.success("Order placed.");
      router.push(`/orders/${result.data.orderId}`);
    });
  }

  const filters: CategoryFilter[] = ["ALL", ...activeCategories];

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* Catalogue */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="relative sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search items…"
                aria-label="Search items"
                className="pl-9"
              />
            </div>

            <div
              role="group"
              aria-label="Filter by category"
              className="flex flex-wrap gap-2"
            >
              {filters.map((c) => {
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(c)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {c === "ALL" ? "All" : ITEM_CATEGORY_LABEL[c]}
                  </button>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
              No items match your search.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  line={lineByItem.get(item.id)}
                  onAdd={() => addItem(item.id)}
                  onStep={(delta) => stepQuantity(item.id, delta)}
                  onSetQuantity={(v) => setQuantity(item.id, v)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Summary */}
        <Card className="flex flex-col gap-4 p-5 lg:sticky lg:top-20">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Order summary</h2>
            <span className="text-sm text-muted-foreground">
              {lines.length} {lines.length === 1 ? "item" : "items"}
            </span>
          </div>

          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No items yet. Pick something from the catalogue.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {lines.map((line) => {
                const item = itemsById.get(line.itemId);
                if (!item) return null;
                const qty = qtyValue(line.quantity);
                return (
                  <li key={line.key} className="flex gap-3 py-3 first:pt-0">
                    <Thumb src={item.image_url} name={item.name} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {item.name}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => removeItem(line.itemId)}
                          className="-mr-1 shrink-0 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {qty} × {formatMoney(item.price)}
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        {formatMoney(item.price * qty)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Estimated total</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(estimatedTotal)}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the org should know about this request."
              maxLength={500}
              rows={3}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            The total is confirmed by the server when you submit and is locked
            to today&apos;s catalogue prices.
          </p>

          <div className="flex flex-col gap-2">
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
        </Card>
      </div>
    </div>
  );
}

function Thumb({ src, name }: { src: string | null; name: string }) {
  if (!src) {
    return (
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-md bg-subtle text-muted-foreground"
      >
        <Package className="size-5" />
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={name}
      width={48}
      height={48}
      className="size-12 shrink-0 rounded-md bg-subtle object-contain p-1"
    />
  );
}

function ItemCard({
  item,
  line,
  onAdd,
  onStep,
  onSetQuantity,
}: {
  item: OrderableItem;
  line: Line | undefined;
  onAdd: () => void;
  onStep: (delta: number) => void;
  onSetQuantity: (value: string) => void;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] w-full bg-subtle">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(min-width: 1280px) 20vw, (min-width: 640px) 30vw, 45vw"
            className="object-contain p-4"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-muted-foreground"
          >
            <Package className="size-8" />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-1 flex-col gap-1">
          <h3 className="line-clamp-2 text-sm font-medium">{item.name}</h3>
          <p className="text-xs text-muted-foreground">
            per {ITEM_UNIT_LABEL[item.unit].toLowerCase()}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {formatMoney(item.price)}
          </p>
        </div>

        {line ? (
          <div className="flex items-center justify-between rounded-md border border-border">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Decrease quantity of ${item.name}`}
              onClick={() => onStep(-1)}
            >
              <Minus className="size-4" />
            </Button>
            <input
              value={line.quantity}
              onChange={(e) => onSetQuantity(e.target.value)}
              onBlur={(e) => {
                if (qtyValue(e.target.value) <= 0) onSetQuantity("1");
              }}
              inputMode="numeric"
              aria-label={`Quantity of ${item.name}`}
              className="w-full min-w-0 bg-transparent text-center text-sm tabular-nums focus:outline-none"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label={`Increase quantity of ${item.name}`}
              onClick={() => onStep(1)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={onAdd}
          >
            <Plus className="size-4" />
            Add
          </Button>
        )}
      </div>
    </Card>
  );
}
