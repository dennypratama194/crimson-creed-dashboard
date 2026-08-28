import { ITEM_CATEGORY_LABEL, ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import type { Item } from "@/lib/db/items";
import { formatMoney, formatQuantity } from "@/lib/format";
import { ItemThumb } from "@/components/patterns/item-thumb";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemRowActions } from "@/app/(app)/admin/items/item-row-actions";

function statusBadge(item: Item) {
  if (item.archived_at) return <Badge tone="gray">Archived</Badge>;
  if (!item.active) return <Badge tone="warning">Inactive</Badge>;
  if (!item.orderable) return <Badge tone="info">Not orderable</Badge>;
  return <Badge tone="success">Active</Badge>;
}

export function ItemsTable({ rows }: { rows: Item[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>
            <span data-align="right" className="block">
              Price
            </span>
          </TableHead>
          <TableHead>
            <span data-align="right" className="block">
              Low-stock
            </span>
          </TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <ItemThumb src={item.image_url} name={item.name} size="sm" />
                <div className="min-w-0">
                  <div className="font-medium">{item.name}</div>
                  {item.description ? (
                    <div className="line-clamp-1 max-w-md text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  ) : null}
                </div>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {ITEM_CATEGORY_LABEL[item.category]}
            </TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">
              {item.sku ?? "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(item.price)}
              <span className="text-muted-foreground">
                {" "}
                / {ITEM_UNIT_LABEL[item.unit].toLowerCase()}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {item.low_stock_threshold > 0
                ? formatQuantity(item.low_stock_threshold)
                : "—"}
            </TableCell>
            <TableCell>{statusBadge(item)}</TableCell>
            <TableCell>
              <ItemRowActions item={item} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
