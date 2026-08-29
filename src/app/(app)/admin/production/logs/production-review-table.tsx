import { PRODUCTION_LOG_STATUS_LABEL } from "@/lib/constants/labels";
import { PRODUCTION_LOG_STATUS_TONE } from "@/lib/constants/status-config";
import type { AdminProductionLogRow } from "@/lib/db/production";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReviewLogDialog } from "@/app/(app)/admin/production/logs/review-log-dialog";

export function ProductionReviewTable({
  rows,
}: {
  rows: AdminProductionLogRow[];
}) {
  return (
    <Table className="min-w-[820px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Date</TableHead>
          <TableHead>Member</TableHead>
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
            <TableCell className="truncate">{log.member_name}</TableCell>
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
            </TableCell>
            <TableCell className="text-right">
              {log.status === "PENDING" ? (
                <ReviewLogDialog
                  logId={log.id}
                  summary={`${log.member_name} — ${formatQuantity(log.quantity)} of ${log.item_name_snapshot} (${formatMoney(log.payout_amount)})`}
                />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
