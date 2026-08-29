"use client";

import { Pencil, Plus } from "lucide-react";

import { ITEM_UNIT_LABEL } from "@/lib/constants/labels";
import type { ProductionRateRow } from "@/lib/db/production";
import { formatDate, formatMoney } from "@/lib/format";
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
import { SetRateDialog } from "@/app/(app)/admin/production/rates/set-rate-dialog";

export function RatesTable({ rows }: { rows: ProductionRateRow[] }) {
  return (
    <Table className="min-w-[640px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead className="w-40">
            <span data-align="right" className="block">
              Rate
            </span>
          </TableHead>
          <TableHead className="w-36">Updated</TableHead>
          <TableHead className="w-28">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const unitLabel = ITEM_UNIT_LABEL[row.unit].toLowerCase();
          return (
            <TableRow key={row.item_id}>
              <TableCell className="truncate font-medium">{row.name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.unit_rate === null ? (
                  <Badge tone="warning">Not set</Badge>
                ) : (
                  <>
                    {formatMoney(row.unit_rate)}
                    <span className="text-muted-foreground">/{unitLabel}</span>
                  </>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {row.updated_at ? formatDate(row.updated_at) : "—"}
              </TableCell>
              <TableCell className="text-right">
                <SetRateDialog
                  itemId={row.item_id}
                  itemName={row.name}
                  unit={row.unit}
                  currentRate={row.unit_rate}
                  trigger={
                    <Button variant="ghost" size="sm">
                      {row.unit_rate === null ? (
                        <>
                          <Plus aria-hidden />
                          Set rate
                        </>
                      ) : (
                        <>
                          <Pencil aria-hidden />
                          Edit
                        </>
                      )}
                    </Button>
                  }
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
