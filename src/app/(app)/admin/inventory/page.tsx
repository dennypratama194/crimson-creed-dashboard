import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, ChevronRight } from "lucide-react";

import { ITEM_CATEGORY_LABEL, ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import { listInventory } from "@/lib/db/inventory";
import { formatQuantity } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { StockBadge } from "@/components/patterns/stock-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  rowLinkOverlay,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { InventoryFilterBar } from "@/app/(app)/admin/inventory/inventory-filter-bar";
import { StockDialog } from "@/app/(app)/admin/inventory/stock-dialog";

export const metadata: Metadata = { title: "Inventory" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminInventoryPage({
  searchParams,
}: PageProps<"/admin/inventory">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.q) ?? "";
  const lowStockOnly = one(sp.low) === "1";

  const { rows, total, pageSize, lowStockCount } = await listInventory({
    page,
    search,
    lowStockOnly,
  });

  return (
    <>
      <PageHeader
        title="Inventory"
        description={
          lowStockCount > 0
            ? `${lowStockCount} item${lowStockCount === 1 ? "" : "s"} at or below threshold.`
            : "Current stock levels for the catalogue."
        }
      />

      <div className="flex flex-col gap-4">
        <InventoryFilterBar />

        {rows.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={search || lowStockOnly ? "Nothing matches" : "No items"}
            description={
              search || lowStockOnly
                ? "Try clearing the filter."
                : "Add items to the catalogue first."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>
                    <span data-align="right" className="block">
                      On hand
                    </span>
                  </TableHead>
                  <TableHead>
                    <span data-align="right" className="block">
                      Threshold
                    </span>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                  <TableHead className="w-8">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <Link
                        href={`/admin/inventory/${line.id}`}
                        className={cn(
                          "font-medium hover:underline",
                          rowLinkOverlay,
                        )}
                      >
                        {line.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ITEM_CATEGORY_LABEL[line.category]}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatQuantity(line.current_quantity)}
                      <span className="text-muted-foreground">
                        {" "}
                        {ITEM_UNIT_LABEL[line.unit].toLowerCase()}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {line.low_stock_threshold > 0
                        ? formatQuantity(line.low_stock_threshold)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <StockBadge state={line.stock_state} />
                    </TableCell>
                    <TableCell className="relative z-10 text-right">
                      <StockDialog
                        itemId={line.id}
                        itemName={line.name}
                        currentQuantity={line.current_quantity}
                        trigger={
                          <Button variant="ghost" size="sm">
                            Adjust
                          </Button>
                        }
                      />
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
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
