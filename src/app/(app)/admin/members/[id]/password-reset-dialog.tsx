"use client";

import { useId, useState, useTransition } from "react";

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
import { resetMemberPasswordAction } from "@/app/(app)/admin/members/actions";

export function PasswordResetDialog({ memberId }: { memberId: string }) {
  const newId = useId();
  const confirmId = useId();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPw("");
          setConfirm("");
          setMessage(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="secondary">Reset password</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password and share it with the member securely.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={newId}>New password</Label>
          <Input
            id={newId}
            type="text"
            autoComplete="off"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={confirmId}>Confirm</Label>
          <Input
            id={confirmId}
            type="text"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {message ? (
          <p
            className={
              message.kind === "error"
                ? "rounded-md border border-tone-error-border bg-tone-error-bg px-3 py-2 text-sm text-tone-error-fg"
                : "rounded-md border border-tone-success-border bg-tone-success-bg px-3 py-2 text-sm text-tone-success-fg"
            }
          >
            {message.text}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Close
            </Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const result = await resetMemberPasswordAction(
                  memberId,
                  pw,
                  confirm,
                );
                if (result.ok) {
                  setMessage({ kind: "success", text: "Password updated." });
                  setPw("");
                  setConfirm("");
                } else {
                  setMessage({
                    kind: "error",
                    text: result.error ?? "Could not reset the password.",
                  });
                }
              })
            }
          >
            {pending ? "Resetting…" : "Reset password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
