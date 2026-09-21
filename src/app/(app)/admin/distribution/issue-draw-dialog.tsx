"use client";

import { useId, useMemo, useState, useTransition, type ReactNode } from "react";

import { ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import type { DrawableItem } from "@/lib/db/distribution";
import type { MemberOption } from "@/lib/db/members";
import { formatMoney, formatQuantity } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
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
  getDistributionIssueOptionsAction,
  issueDistributionAction,
} from "@/app/(app)/admin/distribution/actions";

export function IssueDrawDialog({ trigger }: { trigger: ReactNode }) {
  const qtyId = useId();
  const noteId = useId();

  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [items, setItems] = useState<DrawableItem[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = useMemo(
    () => items.find((i) => i.id === itemId) ?? null,
    [items, itemId],
  );
  const qtyNum = Number(quantity);
  const qtyValid = Number.isInteger(qtyNum) && qtyNum > 0;
  const owedPreview = selected && qtyValid ? selected.unit_rate * qtyNum : null;
  const shortStock = selected && qtyValid && qtyNum > selected.current_quantity;

  function reset() {
    setMemberId("");
    setItemId("");
    setQuantity("");
    setNote("");
    setError(null);
  }

  async function loadOptions() {
    if (loadingOptions || (members.length > 0 && items.length > 0)) return;
    setLoadingOptions(true);
    setOptionsError(null);
    const result = await getDistributionIssueOptionsAction();
    if (result.ok) {
      setMembers(result.members);
      setItems(result.items);
      if (result.members.length === 0 || result.items.length === 0) {
        setOptionsError(
          result.members.length === 0
            ? "No active members are available for a draw."
            : "No drawable items are available. Set a company cut first.",
        );
      }
    } else {
      setOptionsError(result.error);
    }
    setLoadingOptions(false);
  }

  function submit() {
    setError(null);
    if (!memberId) {
      setError("Pick who took the stock.");
      return;
    }
    if (!itemId) {
      setError("Pick an item.");
      return;
    }
    if (!qtyValid) {
      setError("Enter a whole quantity greater than zero.");
      return;
    }

    startTransition(async () => {
      const result = await issueDistributionAction({
        memberId,
        itemId,
        quantity: qtyNum,
        note: note.trim() || null,
      });
      if (!result.ok) {
        const message = result.error ?? "Could not record the draw.";
        setError(message);
        toast.error(message);
        return;
      }
      setOpen(false);
      toast.success("Draw recorded and stock released.");
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
          <DialogTitle>Record a draw</DialogTitle>
          <DialogDescription>
            Releases stock from the company stash and records what the member
            owes back. The stash is reduced immediately.
          </DialogDescription>
        </DialogHeader>

        {loadingOptions ? (
          <p className="text-sm text-muted-foreground">
            Loading available members and items…
          </p>
        ) : null}
        {optionsError ? (
          <p className="text-sm text-tone-error-fg">{optionsError}</p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label>Member</Label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger
              aria-label="Member"
              disabled={loadingOptions || !!optionsError}
            >
              <SelectValue placeholder="Who took the stock?" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Item</Label>
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger
              aria-label="Item"
              disabled={loadingOptions || !!optionsError}
            >
              <SelectValue placeholder="Choose an item" />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name} — {formatMoney(i.unit_rate)}/
                  {ITEM_UNIT_LABEL[i.unit].toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected ? (
            <p className="text-xs text-muted-foreground">
              {formatQuantity(selected.current_quantity)} in stock
            </p>
          ) : null}
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
            min={1}
            step={1}
            inputMode="numeric"
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
            placeholder="e.g. Night run, south side"
            maxLength={300}
          />
        </div>

        <p className="rounded-md border border-border bg-subtle px-3 py-2 text-sm">
          Owes the company:{" "}
          <span className="font-semibold tabular-nums">
            {owedPreview === null ? "—" : formatMoney(owedPreview)}
          </span>
          {selected ? (
            <span className="text-muted-foreground">
              {" "}
              at {formatMoney(selected.unit_rate)} per{" "}
              {ITEM_UNIT_LABEL[selected.unit].toLowerCase()}
            </span>
          ) : null}
        </p>

        {shortStock ? (
          <p className="rounded-md border border-tone-warning-border bg-tone-warning-bg px-3 py-2 text-sm text-tone-warning-fg">
            Only {formatQuantity(selected.current_quantity)} in stock. Add stock
            in Company stash first.
          </p>
        ) : null}

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
            disabled={
              pending || shortStock === true || loadingOptions || !!optionsError
            }
          >
            {pending ? "Recording…" : "Record draw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
