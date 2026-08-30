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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-full">Product</TableHead>
          <TableHead>Rate</TableHead>
          <TableHead className="whitespace-nowrap">Updated</TableHead>
          <TableHead>
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const unitLabel = ITEM_UNIT_LABEL[row.unit].toLowerCase();
          return (
            <TableRow key={row.item_id}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
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
              <TableCell>
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
