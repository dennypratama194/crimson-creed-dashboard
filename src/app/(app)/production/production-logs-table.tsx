"use client";

import { useRouter } from "next/navigation";

import { PRODUCTION_LOG_STATUS_LABEL } from "@/lib/constants/labels";
import { PRODUCTION_LOG_STATUS_TONE } from "@/lib/constants/status-config";
import type { ProductionLog } from "@/lib/db/production";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
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
import { cancelProductionLogAction } from "@/app/(app)/production/actions";

export function ProductionLogsTable({ rows }: { rows: ProductionLog[] }) {
  const router = useRouter();

  return (
    <Table className="min-w-[720px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Date</TableHead>
          <TableHead>Product</TableHead>
          <TableHead className="w-28">
            <span data-align="right" className="block">
              Quantity
            </span>
          </TableHead>
          <TableHead className="w-32">
            <span data-align="right" className="block">
              Payout
            </span>
          </TableHead>
          <TableHead className="w-32">Status</TableHead>
          <TableHead className="w-24">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(log.occurred_at)}
            </TableCell>
            <TableCell className="truncate">
              {log.item_name_snapshot}
              {log.note ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {log.note}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatQuantity(log.quantity)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatMoney(log.payout_amount)}
            </TableCell>
            <TableCell>
              <Badge tone={PRODUCTION_LOG_STATUS_TONE[log.status]}>
                {PRODUCTION_LOG_STATUS_LABEL[log.status]}
              </Badge>
              {log.status === "REJECTED" && log.review_note ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {log.review_note}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-right">
              {log.status === "PENDING" ? (
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm">
                      Cancel
                    </Button>
                  }
                  title="Cancel this production log?"
                  description="You can only cancel while it is still pending review."
                  confirmLabel="Cancel log"
                  destructive
                  successMessage="Production log cancelled."
                  onConfirm={async () => {
                    const result = await cancelProductionLogAction(log.id);
                    if (result.ok) router.refresh();
                    return result;
                  }}
                />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
