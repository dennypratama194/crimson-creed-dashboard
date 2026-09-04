import Link from "next/link";

import { ITEM_CATEGORY_LABEL } from "@/lib/constants/labels";
import type { SupplierGroup } from "@/lib/db/suppliers";
import { formatMoney, formatQuantity } from "@/lib/format";
import { ItemThumb } from "@/components/patterns/item-thumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The "by supplier" view: one card per supplier, each listing what that
 * supplier carries with its own buy price, sell price and per-order cap —
 * mirrors the sourcing sheet. Super Admin only.
 */
export function SupplierCatalogue({ groups }: { groups: SupplierGroup[] }) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ supplier, lines }) => (
        <Card key={supplier.id}>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle>
                <Link
                  href={`/admin/suppliers/${supplier.id}`}
                  className="hover:underline"
                >
                  {supplier.name}
                </Link>
              </CardTitle>
              {!supplier.active ? <Badge tone="warning">Inactive</Badge> : null}
            </div>
            <span className="text-sm text-muted-foreground">
              {formatQuantity(lines.length)}{" "}
              {lines.length === 1 ? "item" : "items"}
            </span>
          </CardHeader>
          <CardContent className="pt-2">
            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing listed for this supplier yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>
                      <span>Buy</span>
                    </TableHead>
                    <TableHead>
                      <span>Sell</span>
                    </TableHead>
                    <TableHead>
                      <span>Max / order</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ItemThumb
                            src={line.item.image_url}
                            name={line.item.name}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="font-medium">{line.item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {ITEM_CATEGORY_LABEL[line.item.category]}
                              {line.item.orderable && line.item.active
                                ? ""
                                : " · not sold to members"}
                              {!line.active ? " · line disabled" : ""}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatMoney(line.buy_price)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {line.sell_price === null
                          ? "—"
                          : formatMoney(line.sell_price)}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {line.max_quantity === null
                          ? "—"
                          : formatQuantity(line.max_quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
