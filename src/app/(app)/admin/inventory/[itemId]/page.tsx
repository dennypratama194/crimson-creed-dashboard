import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  ITEM_CATEGORY_LABEL,
  ITEM_UNIT_LABEL,
  MOVEMENT_TYPE_LABEL,
  STOCK_TYPE_LABEL,
} from "@/lib/constants/labels";
import { getInventoryDetail } from "@/lib/db/inventory";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { StockBadge } from "@/components/patterns/stock-badge";
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
import { StockDialog } from "@/app/(app)/admin/inventory/stock-dialog";

export const metadata: Metadata = { title: "Stock" };

function stockState(qty: number, threshold: number) {
  if (qty <= 0) return "out" as const;
  if (threshold > 0 && qty <= threshold) return "low" as const;
  return "ok" as const;
}

export default async function InventoryItemPage({
  params,
  searchParams,
}: PageProps<"/admin/inventory/[itemId]">) {
  const { itemId } = await params;
  const sp = await searchParams;
  const mp = Math.max(1, Number(Array.isArray(sp.mp) ? sp.mp[0] : sp.mp) || 1);

  const detail = await getInventoryDetail(itemId, mp);
  if (!detail) notFound();

  const { item, currentQuantity, movements, movementTotal, movementPageSize } =
    detail;
  const totalPages = Math.max(1, Math.ceil(movementTotal / movementPageSize));

  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/inventory">
            <ArrowLeft aria-hidden />
            Inventory
          </Link>
        </Button>
      </div>

      <PageHeader
        title={item.name}
        description={`${STOCK_TYPE_LABEL[item.stock_type]} · ${
          ITEM_CATEGORY_LABEL[item.category]
        } · per ${ITEM_UNIT_LABEL[item.unit].toLowerCase()}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href={`/admin/items/${item.id}/edit` as Route}>
                Edit details
              </Link>
            </Button>
            <StockDialog
              itemId={item.id}
              itemName={item.name}
              currentQuantity={currentQuantity}
              trigger={<Button>Adjust stock</Button>}
            />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>On hand</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-4">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              {formatQuantity(currentQuantity)}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                {ITEM_UNIT_LABEL[item.unit].toLowerCase()}
              </span>
            </p>
            <StockBadge
              state={stockState(currentQuantity, item.low_stock_threshold)}
            />
          </CardContent>
        </Card>

        <section className="flex min-w-0 flex-col gap-3 lg:col-span-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Movement history
          </h2>
          {movements.length === 0 ? (
            <EmptyState
              title="No movements yet"
              description="Stock changes will appear here."
            />
          ) : (
            <>
              {/* Capped so the card keeps a steady height however long the
                  history gets — the rows scroll inside it instead. */}
              <Table scrollerClassName="max-h-[28rem] overflow-y-auto">
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>
                      <span data-align="right" className="block">
                        Change
                      </span>
                    </TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(m.created_at)}
                      </TableCell>
                      <TableCell>
                        {MOVEMENT_TYPE_LABEL[m.movement_type]}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          m.quantity < 0
                            ? "text-tone-error-fg"
                            : "text-tone-success-fg"
                        }`}
                      >
                        {m.quantity > 0 ? "+" : ""}
                        {formatQuantity(m.quantity)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.performed_by_name ?? "System"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {m.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 ? (
                <div className="flex items-center justify-between pt-3 text-sm">
                  <span className="text-muted-foreground">
                    Page {mp} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      asChild
                      disabled={mp <= 1}
                    >
                      <Link
                        href={
                          `/admin/inventory/${item.id}?mp=${mp - 1}` as Route
                        }
                      >
                        Previous
                      </Link>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      asChild
                      disabled={mp >= totalPages}
                    >
                      <Link
                        href={
                          `/admin/inventory/${item.id}?mp=${mp + 1}` as Route
                        }
                      >
                        Next
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  );
}
