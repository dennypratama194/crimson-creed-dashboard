"use client";

import { Check, Undo2 } from "lucide-react";

import { DRAW_STATUS_LABEL } from "@/lib/constants/labels";
import { DRAW_STATUS_TONE } from "@/lib/constants/status-config";
import type { AdminDistributionRow } from "@/lib/db/distribution";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { ActionDialog } from "@/components/patterns/action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  reverseDistributionAction,
  settleDistributionAction,
} from "@/app/(app)/admin/distribution/actions";

export function DistributionTable({ rows }: { rows: AdminDistributionRow[] }) {
  // Proportional widths so every column grows together as the viewport widens,
  // rather than two auto columns taking all the slack.
  return (
    <Table className="min-w-[1100px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[10%]">Draw</TableHead>
          <TableHead className="w-[10%]">Date</TableHead>
          <TableHead className="w-[14%]">Member</TableHead>
          <TableHead className="w-[16%]">Item</TableHead>
          <TableHead className="w-[9%]">
            <span data-align="right" className="block">
              Quantity
            </span>
          </TableHead>
          <TableHead className="w-[11%]">
            <span data-align="right" className="block">
              Owed (dirty)
            </span>
          </TableHead>
          <TableHead className="w-[12%]">Status</TableHead>
          <TableHead className="w-[18%]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((draw) => (
          <TableRow key={draw.id}>
            <TableCell className="font-mono text-sm">
              {draw.draw_number}
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(draw.issued_at)}
            </TableCell>
            <TableCell className="truncate">{draw.member_name}</TableCell>
            <TableCell className="truncate">
              {draw.item_name_snapshot}
              {draw.note ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {draw.note}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatQuantity(draw.quantity)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatMoney(draw.amount_owed)}
            </TableCell>
            <TableCell>
              <Badge tone={DRAW_STATUS_TONE[draw.status]}>
                {DRAW_STATUS_LABEL[draw.status]}
              </Badge>
              {/* Settle and reverse both write resolution_note; show it for
                  either, or the note the operator typed goes nowhere. */}
              {draw.status !== "OPEN" && draw.resolution_note ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {draw.resolution_note}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-right">
              {draw.status === "REVERSED" ? null : (
                <div className="flex justify-end gap-1">
                  {draw.status === "OPEN" ? (
                    <ActionDialog
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Check aria-hidden />
                          Mark done
                        </Button>
                      }
                      title="Mark this draw as done?"
                      description={`Records that ${draw.member_name} handed ${formatMoney(draw.amount_owed)} of dirty money back to the company. This does not post to Company cash.`}
                      confirmLabel="Mark as done"
                      field={{
                        label: "Note",
                        placeholder: "e.g. Paid in full, handed to Vito",
                      }}
                      successMessage="Draw marked as done."
                      onConfirm={async (text) => {
                        const result = await settleDistributionAction({
                          distributionId: draw.id,
                          note: text || null,
                        });
                        return result;
                      }}
                    />
                  ) : null}
                  <ActionDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-tone-error-fg"
                      >
                        <Undo2 aria-hidden />
                        Reverse
                      </Button>
                    }
                    title="Reverse this draw?"
                    description={`Returns ${formatQuantity(draw.quantity)} ${draw.item_name_snapshot} to the stash and voids the ${formatMoney(draw.amount_owed)} owed. Use this only for a mis-entered draw.`}
                    confirmLabel="Reverse draw"
                    destructive
                    field={{
                      label: "Reason",
                      placeholder: "e.g. Wrong quantity entered",
                      required: true,
                    }}
                    successMessage="Draw reversed and stock returned."
                    onConfirm={async (text) => {
                      const result = await reverseDistributionAction({
                        distributionId: draw.id,
                        reason: text,
                      });
                      return result;
                    }}
                  />
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
