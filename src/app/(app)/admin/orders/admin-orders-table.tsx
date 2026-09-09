import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { AdminOrderRow } from "@/lib/db/orders";
import { formatDate, formatMoney } from "@/lib/format";
import { LinkedTableRow } from "@/components/patterns/linked-table-row";
import { OrderStatusBadge } from "@/components/patterns/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AdminOrdersTable({ rows }: { rows: AdminOrderRow[] }) {
  return (
    <Table className="min-w-[900px] table-fixed">
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
          <TableHead className="w-36">Paid to</TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((order) => (
          <LinkedTableRow key={order.id} href={`/admin/orders/${order.id}`}>
            <TableCell>
              <Link
                href={`/admin/orders/${order.id}`}
                className="font-mono text-sm font-medium hover:underline"
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
            <TableCell
              className={
                order.paid_to_name
                  ? "truncate text-foreground"
                  : "truncate text-muted-foreground"
              }
            >
              {order.paid_to_name ?? "—"}
            </TableCell>
            <TableCell className="text-right">
              <ChevronRight
                aria-hidden
                className="inline size-4 text-muted-foreground"
              />
            </TableCell>
          </LinkedTableRow>
        ))}
      </TableBody>
    </Table>
  );
}
