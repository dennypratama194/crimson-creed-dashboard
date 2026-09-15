"use client";

import { useRouter } from "next/navigation";
import { Ban, Users } from "lucide-react";
import { useState } from "react";

import { PRODUCTION_ASSIGNMENT_STATUS_LABEL } from "@/lib/constants/labels";
import { PRODUCTION_ASSIGNMENT_STATUS_TONE } from "@/lib/constants/status-config";
import type { ProductionAssignmentWithCrew } from "@/lib/db/production";
import { formatDate, formatQuantity } from "@/lib/format";
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
import { cancelProductionAssignmentAction } from "@/app/(app)/admin/production/actions";
import { CrewDialog } from "@/app/(app)/admin/production/crew-dialog";

/** "Vito", "Vito, Sal", then "Vito, Sal +2" — one line whatever the crew size. */
function crewSummary(assignment: ProductionAssignmentWithCrew): string {
  const names = assignment.crew.map((c) => c.member_name_snapshot);
  if (names.length === 0) return "—";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export function AssignmentsTable({
  rows,
}: {
  rows: ProductionAssignmentWithCrew[];
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  // Read the live row back out of props so the dialog reflects the latest
  // server data after a refresh, instead of a stale copy captured on open.
  const active = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      {/* Proportional widths, not two auto columns soaking up every spare
          pixel — the columns then grow together as the viewport widens. */}
      <Table className="min-w-[1140px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[10%]">Assigned</TableHead>
            <TableHead className="w-[15%]">Product</TableHead>
            <TableHead className="w-[8%]">
              <span data-align="right" className="block">
                Quantity
              </span>
            </TableHead>
            <TableHead className="w-[20%]">In charge</TableHead>
            <TableHead className="w-[15%]">Note</TableHead>
            <TableHead className="w-[17%]">Status</TableHead>
            <TableHead className="w-[15%]">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const paid = row.crew.filter((c) => c.status === "PAID").length;
            return (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(row.assigned_at)}
                </TableCell>
                <TableCell className="truncate">
                  {row.item_name_snapshot}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQuantity(row.quantity)}
                </TableCell>
                <TableCell className="truncate">{crewSummary(row)}</TableCell>
                <TableCell
                  className="truncate text-muted-foreground"
                  title={row.note ?? undefined}
                >
                  {row.note ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge tone={PRODUCTION_ASSIGNMENT_STATUS_TONE[row.status]}>
                      {PRODUCTION_ASSIGNMENT_STATUS_LABEL[row.status]}
                    </Badge>
                    {row.status === "CANCELLED" ? null : (
                      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        {paid} of {row.crew.length} paid
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenId(row.id)}
                    >
                      <Users aria-hidden />
                      Details
                    </Button>
                    {row.status === "CANCELLED" ? null : (
                      <ActionDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-tone-error-fg"
                          >
                            <Ban aria-hidden />
                            Cancel
                          </Button>
                        }
                        title="Cancel this assignment?"
                        description={`The crew will no longer be shown as in charge of ${row.item_name_snapshot}. The row stays in history.`}
                        confirmLabel="Cancel assignment"
                        destructive
                        field={{
                          label: "Reason",
                          placeholder: "e.g. Reassigned to another crew",
                        }}
                        successMessage="Assignment cancelled."
                        onConfirm={async (text) => {
                          const result = await cancelProductionAssignmentAction(
                            {
                              assignmentId: row.id,
                              reason: text || null,
                            },
                          );
                          if (result.ok) router.refresh();
                          return result;
                        }}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <CrewDialog
        assignment={active}
        open={active !== null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
      />
    </>
  );
}
