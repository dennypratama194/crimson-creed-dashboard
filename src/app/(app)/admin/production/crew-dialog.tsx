"use client";

import { Check, CheckCheck, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";

import { PRODUCTION_ASSIGNMENT_STATUS_LABEL } from "@/lib/constants/labels";
import { PRODUCTION_ASSIGNMENT_STATUS_TONE } from "@/lib/constants/status-config";
import type { ProductionAssignmentWithCrew } from "@/lib/db/production";
import { formatDate, formatQuantity } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
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
  setAssignmentMemberPaidAction,
  setProductionAssignmentPaidAction,
} from "@/app/(app)/admin/production/actions";

/**
 * The crew inside one job. Each person is marked paid on their own line; the
 * job's own status is a rollup the server recomputes after every flip.
 */
export function CrewDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: ProductionAssignmentWithCrew | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cancelled = assignment?.status === "CANCELLED";
  const crew = assignment?.crew ?? [];
  const paidCount = crew.filter((c) => c.status === "PAID").length;
  const allPaid = crew.length > 0 && paidCount === crew.length;

  function toggleOne(lineId: string, paid: boolean) {
    setPendingId(lineId);
    startTransition(async () => {
      const result = await setAssignmentMemberPaidAction({ lineId, paid });
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update the payment status.");
        return;
      }
      toast.success(paid ? "Marked as paid." : "Marked as not paid.");
    });
  }

  function toggleAll(paid: boolean) {
    if (!assignment) return;
    setPendingId("all");
    startTransition(async () => {
      const result = await setProductionAssignmentPaidAction({
        assignmentId: assignment.id,
        paid,
      });
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not update the payment status.");
        return;
      }
      toast.success(paid ? "Whole crew marked paid." : "Whole crew reopened.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {assignment
              ? `${assignment.item_name_snapshot} × ${formatQuantity(assignment.quantity)}`
              : "Assignment"}
          </DialogTitle>
          <DialogDescription>
            {assignment ? (
              <>
                Assigned {formatDate(assignment.assigned_at)} · {paidCount} of{" "}
                {crew.length} paid
                {assignment.note ? ` · ${assignment.note}` : ""}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {cancelled ? (
          <p className="rounded-md border border-border bg-subtle px-3 py-2 text-sm text-muted-foreground">
            This assignment was cancelled. Payment status can no longer be
            changed.
          </p>
        ) : null}

        <ul className="flex flex-col gap-1">
          {crew.map((line) => (
            <li
              key={line.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {line.member_name_snapshot}
                </p>
                {line.paid_at ? (
                  <p className="text-xs text-muted-foreground">
                    Paid {formatDate(line.paid_at)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={PRODUCTION_ASSIGNMENT_STATUS_TONE[line.status]}>
                  {PRODUCTION_ASSIGNMENT_STATUS_LABEL[line.status]}
                </Badge>
                {cancelled ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => toggleOne(line.id, line.status !== "PAID")}
                  >
                    {line.status === "PAID" ? (
                      <Undo2 aria-hidden />
                    ) : (
                      <Check aria-hidden />
                    )}
                    {pendingId === line.id
                      ? "Saving…"
                      : line.status === "PAID"
                        ? "Mark not paid"
                        : "Mark paid"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Close
            </Button>
          </DialogClose>
          {cancelled || crew.length < 2 ? null : (
            <Button onClick={() => toggleAll(!allPaid)} disabled={pending}>
              {allPaid ? <Undo2 aria-hidden /> : <CheckCheck aria-hidden />}
              {pendingId === "all"
                ? "Saving…"
                : allPaid
                  ? "Mark all not paid"
                  : "Mark all paid"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
