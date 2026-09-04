import Link from "next/link";

import type { SupplierWithCounts } from "@/lib/db/suppliers";
import { formatQuantity } from "@/lib/format";
import { LinkedTableRow } from "@/components/patterns/linked-table-row";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SupplierRowActions } from "@/app/(app)/admin/suppliers/supplier-row-actions";

function statusBadge(supplier: SupplierWithCounts) {
  if (supplier.archived_at) return <Badge tone="gray">Archived</Badge>;
  if (!supplier.active) return <Badge tone="warning">Inactive</Badge>;
  return <Badge tone="success">Active</Badge>;
}

export function SuppliersTable({ rows }: { rows: SupplierWithCounts[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>Items listed</TableHead>
          <TableHead>Sold to members</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((supplier) => (
          <LinkedTableRow
            key={supplier.id}
            href={`/admin/suppliers/${supplier.id}`}
          >
            <TableCell>
              <Link
                href={`/admin/suppliers/${supplier.id}`}
                className="font-medium hover:underline"
              >
                {supplier.name}
              </Link>
              {supplier.contact ? (
                <div className="text-xs text-muted-foreground">
                  {supplier.contact}
                </div>
              ) : null}
            </TableCell>
            <TableCell className="tabular-nums">
              {formatQuantity(supplier.item_count)}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {formatQuantity(supplier.orderable_count)}
            </TableCell>
            <TableCell>{statusBadge(supplier)}</TableCell>
            <TableCell>
              <SupplierRowActions supplier={supplier} />
            </TableCell>
          </LinkedTableRow>
        ))}
      </TableBody>
    </Table>
  );
}
