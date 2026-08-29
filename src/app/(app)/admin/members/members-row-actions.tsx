"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2, UserCheck, UserX } from "lucide-react";

import type { MemberStatus } from "@/lib/constants/enums";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setMemberStatusAction } from "@/app/(app)/admin/members/actions";
import { MemberDeleteDialog } from "@/app/(app)/admin/members/member-delete-dialog";

export function MembersRowActions({
  memberId,
  displayName,
  status,
}: {
  memberId: string;
  displayName: string;
  status: MemberStatus;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const next: MemberStatus = status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const deactivating = next === "INACTIVE";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${displayName}`}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem asChild>
            <Link href={`/admin/members/${memberId}`}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setError(null);
              setConfirmOpen(true);
            }}
          >
            {deactivating ? <UserX aria-hidden /> : <UserCheck aria-hidden />}
            {deactivating ? "Deactivate" : "Reactivate"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-tone-error-fg focus:text-tone-error-fg"
            onSelect={(event) => {
              event.preventDefault();
              setDeleteOpen(true);
            }}
          >
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MemberDeleteDialog
        memberId={memberId}
        displayName={displayName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deactivating
                ? "Deactivate this member?"
                : "Reactivate this member?"}
            </DialogTitle>
            <DialogDescription>
              {deactivating
                ? `${displayName} will not be able to sign in until reactivated. Their orders and history stay intact.`
                : `${displayName} will be able to sign in again.`}
            </DialogDescription>
          </DialogHeader>

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
              variant={deactivating ? "destructive" : "primary"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await setMemberStatusAction(memberId, next);
                  if (result.ok) {
                    setConfirmOpen(false);
                    router.refresh();
                  } else {
                    setError(result.error ?? "Something went wrong.");
                  }
                })
              }
            >
              {pending
                ? "Working…"
                : deactivating
                  ? "Deactivate"
                  : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
