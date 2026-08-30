import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  CASH_CATEGORY_LABEL,
  CASH_ENTRY_SOURCE_LABEL,
} from "@/lib/constants/labels";
import type { CashEntryRow } from "@/lib/db/cash";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LinkedTableRow } from "@/components/patterns/linked-table-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function signedMoney(direction: "IN" | "OUT", amount: number): string {
  return `${direction === "IN" ? "+" : "−"}${formatMoney(amount)}`;
}

export function LedgerTable({ rows }: { rows: CashEntryRow[] }) {
  return (
    <Table className="min-w-[1100px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Date</TableHead>
          <TableHead className="w-32">Entry</TableHead>
          <TableHead className="w-40">Category</TableHead>
          <TableHead className="w-40">Handled by</TableHead>
          <TableHead>Note</TableHead>
          <TableHead className="w-36">
            <span data-align="right" className="block">
              Amount
            </span>
          </TableHead>
          <TableHead className="w-36">
            <span data-align="right" className="block">
              Balance
            </span>
          </TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((entry) => (
          <LinkedTableRow key={entry.id} href={`/admin/cash/${entry.id}`}>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(entry.occurred_at)}
            </TableCell>
            <TableCell>
              <Link
                href={`/admin/cash/${entry.id}`}
                className="font-mono text-sm font-medium hover:underline"
              >
                {entry.entry_number}
              </Link>
              {entry.source !== "MANUAL" ? (
                <span className="block text-xs text-muted-foreground">
                  {CASH_ENTRY_SOURCE_LABEL[entry.source]}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="truncate">
              {CASH_CATEGORY_LABEL[entry.category]}
            </TableCell>
            <TableCell className="truncate text-muted-foreground">
              {entry.handled_by_name ?? <span aria-hidden>—</span>}
            </TableCell>
            <TableCell className="truncate text-muted-foreground">
              {entry.note ? (
                <span title={entry.note}>{entry.note}</span>
              ) : (
                <span aria-hidden>—</span>
              )}
            </TableCell>
            <TableCell
              className={cn(
                "text-right font-medium tabular-nums",
                entry.direction === "IN"
                  ? "text-tone-success-fg"
                  : "text-tone-error-fg",
              )}
            >
              {signedMoney(entry.direction, entry.amount)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground tabular-nums">
              {formatMoney(entry.balance_after)}
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
  );
}
