import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { AdminOrderRow } from "@/lib/db/orders";
import { formatDate, formatMoney } from "@/lib/format";
import {
  DistributionStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/patterns/status-badge";
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order</TableHead>
          <TableHead>Member</TableHead>
          <TableHead>Placed</TableHead>
          <TableHead>
            <span data-align="right" className="block">
              Total
            </span>
          </TableHead>
          <TableHead>Order</TableHead>
          <TableHead>Payment</TableHead>
          <TableHead>Distribution</TableHead>
          <TableHead>
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
                className="font-mono text-sm font-medium hover:underline"
              >
                {order.order_number}
              </Link>
            </TableCell>
            <TableCell>{order.member_name}</TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(order.created_at)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {formatMoney(order.total)}
            </TableCell>
            <TableCell>
              <OrderStatusBadge status={order.status} />
            </TableCell>
            <TableCell>
              <PaymentStatusBadge status={order.payment_status} />
            </TableCell>
            <TableCell>
              <DistributionStatusBadge status={order.distribution_status} />
            </TableCell>
            <TableCell className="text-right">
              <Link
                href={`/admin/orders/${order.id}`}
                aria-label={`Open order ${order.order_number}`}
                className="inline-flex text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
