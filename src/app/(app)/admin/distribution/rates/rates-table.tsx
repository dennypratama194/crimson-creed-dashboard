"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { ITEM_UNIT_LABEL, STOCK_TYPE_LABEL } from "@/lib/constants/labels";
import type { DistributionRateRow } from "@/lib/db/distribution";
import { formatDate, formatMoney } from "@/lib/format";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
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
import { removeDistributionRateAction } from "@/app/(app)/admin/distribution/actions";
import { SetRateDialog } from "@/app/(app)/admin/distribution/rates/set-rate-dialog";

export function RatesTable({ rows }: { rows: DistributionRateRow[] }) {
  const [editing, setEditing] = useState<DistributionRateRow | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Table className="min-w-[840px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[28%]">Item</TableHead>
            <TableHead className="w-[16%]">Stock type</TableHead>
            <TableHead className="w-[18%]">
              <span data-align="right" className="block">
                Company cut
              </span>
            </TableHead>
            <TableHead className="w-[14%]">Updated</TableHead>
            <TableHead className="w-[24%]">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.item_id}>
              <TableCell className="truncate font-medium">{row.name}</TableCell>
              <TableCell>
                <Badge tone="gray">{STOCK_TYPE_LABEL[row.stock_type]}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="font-medium">
                  {formatMoney(row.unit_rate)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  per {ITEM_UNIT_LABEL[row.unit].toLowerCase()}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(row.updated_at)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                  >
                    <Pencil aria-hidden />
                    Edit
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-tone-error-fg"
                      >
                        <Trash2 aria-hidden />
                        Delete
                      </Button>
                    }
                    title={`Remove ${row.name} from the company cut?`}
                    description="It drops off this list and can no longer be drawn. The item itself stays in Company stash, and existing draws keep the rate they were issued at."
                    confirmLabel="Delete cut"
                    destructive
                    successMessage="Removed from the company cut."
                    onConfirm={async () => {
                      const result = await removeDistributionRateAction({
                        itemId: row.item_id,
                      });
                      return result;
                    }}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <SetRateDialog row={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}
