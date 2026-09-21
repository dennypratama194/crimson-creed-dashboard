"use client";

import { ChevronDown } from "lucide-react";
import { useId, useMemo, useState, useTransition, type ReactNode } from "react";

import { ITEM_UNIT_LABEL, STOCK_TYPE_LABEL } from "@/lib/constants/labels";
import type { MemberOption } from "@/lib/db/members";
import type { AssignableProduct } from "@/lib/db/production";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createProductionAssignmentAction,
  getProductionAssignmentOptionsAction,
} from "@/app/(app)/admin/production/actions";

export function AssignDialog({ trigger }: { trigger: ReactNode }) {
  const qtyId = useId();
  const noteId = useId();

  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [products, setProducts] = useState<AssignableProduct[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => products.find((p) => p.id === itemId) ?? null,
    [products, itemId],
  );
  const qtyNum = Number(quantity);

  /** "Vito", "Vito, Sal", then "Vito, Sal +2" — the trigger stays one line. */
  const summary = useMemo(() => {
    const names = members
      .filter((m) => memberIds.includes(m.id))
      .map((m) => m.display_name);
    if (names.length === 0) return "";
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }, [members, memberIds]);

  function toggleMember(id: string, checked: boolean) {
    setMemberIds((current) =>
      checked ? [...current, id] : current.filter((m) => m !== id),
    );
  }

  function reset() {
    setMemberIds([]);
    setItemId("");
    setQuantity("");
    setNote("");
    setError(null);
  }

  async function loadOptions() {
    if (loadingOptions || (members.length > 0 && products.length > 0)) return;
    setLoadingOptions(true);
    setOptionsError(null);
    const result = await getProductionAssignmentOptionsAction();
    if (result.ok) {
      setMembers(result.members);
      setProducts(result.products);
      if (result.members.length === 0 || result.products.length === 0) {
        setOptionsError(
          result.members.length === 0
            ? "No active members are available for an assignment."
            : "No active PRODUCT items are available for an assignment.",
        );
      }
    } else {
      setOptionsError(result.error);
    }
    setLoadingOptions(false);
  }

  function submit() {
    setError(null);
    if (memberIds.length === 0) {
      setError("Pick at least one person to put in charge.");
      return;
    }
    if (!itemId) {
      setError("Pick a product.");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }

    startTransition(async () => {
      const result = await createProductionAssignmentAction({
        memberIds,
        itemId,
        quantity: qtyNum,
        note: note.trim() || null,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not create the assignment.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success(
        memberIds.length === 1
          ? "Assignment created."
          : `Assignment created for ${memberIds.length} people.`,
      );
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadOptions();
        else reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign production</DialogTitle>
          <DialogDescription>
            One job, one crew. Everyone picked is listed on it and marked paid
            individually. They see it on their own Production page and cannot
            change it.
          </DialogDescription>
        </DialogHeader>

        {loadingOptions ? (
          <p className="text-sm text-muted-foreground">
            Loading available members and products…
          </p>
        ) : null}
        {optionsError ? (
          <p className="text-sm text-tone-error-fg">{optionsError}</p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label>In charge</Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                className="w-full justify-between font-normal"
                disabled={loadingOptions || !!optionsError}
              >
                <span
                  className={cn(
                    "truncate",
                    !summary && "text-muted-foreground",
                  )}
                >
                  {summary || "Choose one or more members"}
                </span>
                <ChevronDown aria-hidden className="shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            {/* Stays open while ticking names — one trip, not one per person. */}
            <DropdownMenuContent
              align="start"
              className="max-h-64 w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
            >
              <DropdownMenuLabel>
                {memberIds.length > 0
                  ? `${memberIds.length} selected`
                  : "Select members"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {members.map((m) => (
                <DropdownMenuCheckboxItem
                  key={m.id}
                  checked={memberIds.includes(m.id)}
                  onCheckedChange={(next) => toggleMember(m.id, next === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {m.display_name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Product</Label>
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger
              aria-label="Product"
              disabled={loadingOptions || !!optionsError}
            >
              <SelectValue placeholder="Choose a product" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {STOCK_TYPE_LABEL[p.stock_type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={qtyId}>
            Quantity{" "}
            {selected ? (
              <span className="text-muted-foreground">
                ({ITEM_UNIT_LABEL[selected.unit].toLowerCase()})
              </span>
            ) : null}
          </Label>
          <Input
            id={qtyId}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>
            Note <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. West lab, due Friday"
            maxLength={300}
          />
        </div>

        {error ? (
          <p className="rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={pending || loadingOptions || !!optionsError}
          >
            {pending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
