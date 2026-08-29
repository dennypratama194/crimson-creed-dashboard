import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { AdminOrderRow } from "@/lib/db/orders";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/patterns/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  rowLinkOverlay,
} from "@/components/ui/table";

export function AdminOrdersTable({ rows }: { rows: AdminOrderRow[] }) {
  return (
    <Table className="min-w-[760px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Order</TableHead>
          <TableHead>Member</TableHead>
          <TableHead className="w-36">Placed</TableHead>
          <TableHead className="w-36">
            <span data-align="right" className="block">
              Total
            </span>
          </TableHead>
          <TableHead className="w-36">Status</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((order) => (
          <TableRow key={order.id}>
            <TableCell>
              <Link
                href={`/admin/orders/${order.id}`}
                className={cn(
                  "font-mono text-sm font-medium hover:underline",
                  rowLinkOverlay,
                )}
              >
                {order.order_number}
              </Link>
            </TableCell>
            <TableCell className="truncate">{order.member_name}</TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(order.created_at)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatMoney(order.total)}
            </TableCell>
            <TableCell>
              <OrderStatusBadge status={order.status} />
            </TableCell>
            <TableCell className="text-right">
              <ChevronRight
                aria-hidden
                className="inline size-4 text-muted-foreground"
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
