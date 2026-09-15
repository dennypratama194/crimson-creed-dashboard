import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, ChevronRight, Plus } from "lucide-react";

import { STOCK_TYPES, type StockType } from "@/lib/constants/enums";
import {
  ITEM_CATEGORY_LABEL,
  ITEM_UNIT_LABEL,
  STOCK_TYPE_LABEL,
} from "@/lib/constants/labels";
import {
  INVENTORY_STATUSES,
  listInventory,
  type InventoryStatus,
} from "@/lib/db/inventory";
import { formatQuantity } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { ItemThumb } from "@/components/patterns/item-thumb";
import { LinkedTableRow } from "@/components/patterns/linked-table-row";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { StockBadge } from "@/components/patterns/stock-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InventoryFilterBar } from "@/app/(app)/admin/inventory/inventory-filter-bar";
import { InventoryRowActions } from "@/app/(app)/admin/inventory/inventory-row-actions";

export const metadata: Metadata = { title: "Company stash" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminInventoryPage({
  searchParams,
}: PageProps<"/admin/inventory">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.q) ?? "";

  const rawType = one(sp.type);
  const stockType: StockType | "all" = (
    STOCK_TYPES as readonly string[]
  ).includes(rawType ?? "")
    ? (rawType as StockType)
    : "all";

  const rawStatus = one(sp.status);
  const status: InventoryStatus = (
    INVENTORY_STATUSES as readonly string[]
  ).includes(rawStatus ?? "")
    ? (rawStatus as InventoryStatus)
    : "active";

  const { rows, total, pageSize } = await listInventory({
    page,
    search,
    stockType,
    status,
  });

  const isFiltered =
    Boolean(search) || stockType !== "all" || status !== "active";

  return (
    <>
      <PageHeader
        title="Company stash"
        description="Everything the company holds — catalogue stock, raw materials, tools and seized property."
        actions={
          <Button asChild>
            <Link href="/admin/inventory/new">
              <Plus aria-hidden />
              Add item
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <InventoryFilterBar />

        {rows.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={isFiltered ? "Nothing matches" : "Nothing in the stash"}
            description={
              isFiltered
                ? "Try clearing the filter."
                : "Add the first item the company holds."
            }
            action={
              !isFiltered ? (
                <Button asChild variant="secondary">
                  <Link href="/admin/inventory/new">
                    <Plus aria-hidden />
                    Add item
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>
                    <span data-align="right" className="block">
                      On hand
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
                  <LinkedTableRow
                    key={line.id}
                    href={`/admin/inventory/${line.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ItemThumb
                          src={line.image_url}
                          name={line.name}
                          size="sm"
                        />
                        <Link
                          href={`/admin/inventory/${line.id}`}
                          className="font-medium hover:underline"
                        >
                          {line.name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        tone={line.stock_type === "CATALOGUE" ? "info" : "gray"}
                      >
                        {STOCK_TYPE_LABEL[line.stock_type]}
                      </Badge>
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
                    <TableCell>
                      {line.archived_at ? (
                        <Badge tone="gray">Archived</Badge>
                      ) : (
                        <StockBadge state={line.stock_state} />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <InventoryRowActions line={line} />
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
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
