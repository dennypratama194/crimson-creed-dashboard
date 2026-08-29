"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";

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
import { deleteMemberAction } from "@/app/(app)/admin/members/actions";

const CONFIRM_WORD = "delete";

export function MemberDeleteDialog({
  memberId,
  displayName,
  trigger,
  redirectTo,
  open: controlledOpen,
  onOpenChange,
}: {
  memberId: string;
  displayName: string;
  /** Omit when driving the dialog with `open` / `onOpenChange` instead. */
  trigger?: ReactNode;
  /** Where to go after a successful delete. Omit to just refresh in place. */
  redirectTo?: Route;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    setUncontrolledOpen(next);
  };

  const confirmed = value.trim().toLowerCase() === CONFIRM_WORD;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setValue("");
          setError(null);
        }
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {displayName}?</DialogTitle>
          <DialogDescription>
            This permanently removes the account and sign-in. It only works if
            the member has no orders or production history — otherwise
            deactivate them instead. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>
            Type <span className="font-semibold">{CONFIRM_WORD}</span> to
            confirm
          </Label>
          <Input
            id={inputId}
            value={value}
            autoComplete="off"
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={error ? true : undefined}
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
            variant="destructive"
            disabled={pending || !confirmed}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteMemberAction(memberId);
                if (result.ok) {
                  setOpen(false);
                  toast.success(`${displayName} deleted.`);
                  if (redirectTo) router.push(redirectTo);
                  else router.refresh();
                } else {
                  const message = result.error ?? "Something went wrong.";
                  setError(message);
                  toast.error(message);
                }
              })
            }
          >
            {pending ? "Deleting…" : "Delete member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
