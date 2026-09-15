import { DRAW_STATUS_LABEL } from "@/lib/constants/labels";
import { DRAW_STATUS_TONE } from "@/lib/constants/status-config";
import type { Distribution } from "@/lib/db/distribution";
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

/**
 * Read-only: a member never settles or reverses their own draw. The Super
 * Admin who took the money back records it.
 */
export function MyDrawsTable({ rows }: { rows: Distribution[] }) {
  return (
    <Table className="min-w-[680px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Draw</TableHead>
          <TableHead className="w-28">Date</TableHead>
          <TableHead>Item</TableHead>
          <TableHead className="w-24">
            <span data-align="right" className="block">
              Quantity
            </span>
          </TableHead>
          <TableHead className="w-32">
            <span data-align="right" className="block">
              You owe
            </span>
          </TableHead>
          <TableHead className="w-28">Status</TableHead>
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
              {draw.status === "REVERSED" ? (
                <span className="text-muted-foreground line-through">
                  {formatMoney(draw.amount_owed)}
                </span>
              ) : (
                formatMoney(draw.amount_owed)
              )}
            </TableCell>
            <TableCell>
              <Badge tone={DRAW_STATUS_TONE[draw.status]}>
                {DRAW_STATUS_LABEL[draw.status]}
              </Badge>
              {draw.status !== "OPEN" && draw.resolution_note ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {draw.resolution_note}
                </span>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
