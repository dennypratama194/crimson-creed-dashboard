import { PRODUCTION_ASSIGNMENT_STATUS_LABEL } from "@/lib/constants/labels";
import { PRODUCTION_ASSIGNMENT_STATUS_TONE } from "@/lib/constants/status-config";
import type { ProductionAssignmentWithCrew } from "@/lib/db/production";
import { formatDate, formatQuantity } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Read-only: assignments are created and marked paid by a Super Admin. RLS
 * hands a member only their OWN crew line, so the status shown is "have I been
 * paid", never the rest of the crew's.
 */
export function MyAssignmentsTable({
  rows,
}: {
  rows: ProductionAssignmentWithCrew[];
}) {
  return (
    <Table className="min-w-[600px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Assigned</TableHead>
          <TableHead>Product</TableHead>
          <TableHead className="w-24">
            <span data-align="right" className="block">
              Quantity
            </span>
          </TableHead>
          <TableHead className="w-28">Status</TableHead>
          <TableHead className="w-28">Paid on</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const mine = row.crew[0] ?? null;
          const status =
            row.status === "CANCELLED"
              ? "CANCELLED"
              : (mine?.status ?? "UNPAID");
          return (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(row.assigned_at)}
              </TableCell>
              <TableCell className="truncate">
                {row.item_name_snapshot}
                {row.note ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.note}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQuantity(row.quantity)}
              </TableCell>
              <TableCell>
                <Badge tone={PRODUCTION_ASSIGNMENT_STATUS_TONE[status]}>
                  {PRODUCTION_ASSIGNMENT_STATUS_LABEL[status]}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {mine?.paid_at ? formatDate(mine.paid_at) : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
