import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import { getOrderDetail } from "@/lib/db/orders";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/patterns/page-header";
import {
  DistributionStatusBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/patterns/status-badge";
import { Timeline } from "@/components/patterns/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderActions } from "@/app/(app)/orders/[id]/order-actions";

export const metadata: Metadata = { title: "Order" };

export default async function OrderDetailPage({
  params,
}: PageProps<"/orders/[id]">) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  const { order, items, timeline } = detail;

  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/orders">
            <ArrowLeft aria-hidden />
            All orders
          </Link>
        </Button>
      </div>

      <PageHeader
        title={<span className="font-mono">{order.order_number}</span>}
        description={`Placed ${formatDateTime(order.created_at)}`}
        actions={
          <OrderActions
            orderId={order.id}
            status={order.status}
            paymentStatus={order.payment_status}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground uppercase">
                  Order
                </span>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground uppercase">
                  Payment
                </span>
                <PaymentStatusBadge status={order.payment_status} />
                {order.payment_note ? (
                  <span className="text-xs text-muted-foreground">
                    {order.payment_note}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground uppercase">
                  Distribution
                </span>
                <DistributionStatusBadge status={order.distribution_status} />
              </div>
              {order.cancel_reason ? (
                <p className="text-sm text-muted-foreground sm:col-span-3">
                  Reason: {order.cancel_reason}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>
                      <span data-align="right" className="block">
                        Unit price
                      </span>
                    </TableHead>
                    <TableHead>
                      <span data-align="right" className="block">
                        Qty
                      </span>
                    </TableHead>
                    <TableHead>
                      <span data-align="right" className="block">
                        Line total
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <span className="font-medium">
                          {line.item_name_snapshot}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          /{" "}
                          {ITEM_UNIT_LABEL[
                            line.item_unit_snapshot
                          ].toLowerCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(line.unit_price_snapshot)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {line.quantity}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(line.line_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={3} className="font-medium">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(order.total)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="pt-3 text-xs text-muted-foreground">
                Prices and names are snapshots from when the order was placed.
              </p>
            </CardContent>
          </Card>

          {order.note ? (
            <Card>
              <CardHeader>
                <CardTitle>Note</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-sm">{order.note}</CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Timeline entries={timeline} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
