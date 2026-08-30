import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { MEMBER_RANK_LABEL } from "@/lib/constants/labels";
import { getOrderDetail } from "@/lib/db/orders";
import { getMember } from "@/lib/db/members";
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
import { AdminOrderActions } from "@/app/(app)/admin/orders/[id]/admin-order-actions";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderDetailPage({
  params,
}: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  const { order, items, timeline } = detail;
  const member = await getMember(order.member_id);

  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/orders">
            <ArrowLeft aria-hidden />
            All orders
          </Link>
        </Button>
      </div>

      <PageHeader
        title={<span className="font-mono">{order.order_number}</span>}
        description={`Placed ${formatDateTime(order.created_at)}${
          member ? ` by ${member.display_name}` : ""
        }`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <AdminOrderActions
                orderId={order.id}
                status={order.status}
                paymentStatus={order.payment_status}
                distributionStatus={order.distribution_status}
              />
            </CardContent>
          </Card>

          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Items
            </h2>
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
                    <TableCell className="font-medium">
                      {line.item_name_snapshot}
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
          </section>

          {order.note ? (
            <Card>
              <CardHeader>
                <CardTitle>Member note</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-sm">{order.note}</CardContent>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Order</span>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Payment</span>
                <PaymentStatusBadge status={order.payment_status} />
              </div>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Distribution</span>
                <DistributionStatusBadge status={order.distribution_status} />
              </div>
              {order.payment_note ? (
                <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                  Payment note: {order.payment_note}
                </p>
              ) : null}
              {order.distribution_note ? (
                <p className="text-xs text-muted-foreground">
                  Distribution note: {order.distribution_note}
                </p>
              ) : null}
              {order.cancel_reason ? (
                <p className="text-xs text-muted-foreground">
                  Reason: {order.cancel_reason}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {member ? (
            <Card>
              <CardHeader>
                <CardTitle>Member</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 pt-4 text-sm">
                <span className="font-medium">{member.display_name}</span>
                <span className="text-muted-foreground">
                  @{member.username} · {MEMBER_RANK_LABEL[member.rank]}
                </span>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Timeline entries={timeline} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
