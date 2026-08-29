import type { Route } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { Order } from "@/lib/db/orders";
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

export function OrdersTable({
  rows,
  basePath = "/orders",
}: {
  rows: Order[];
  basePath?: string;
}) {
  const hrefFor = (id: string) => `${basePath}/${id}` as Route;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Placed</TableHead>
          <TableHead>
            <span data-align="right" className="block">
              Total
            </span>
          </TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">View</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((order) => (
          <TableRow key={order.id}>
            <TableCell>
              <Link
                href={hrefFor(order.id)}
                className={cn(
                  "font-mono text-sm font-medium hover:underline",
                  rowLinkOverlay,
                )}
              >
                {order.order_number}
              </Link>
            </TableCell>
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
