import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PAYROLL_RUN_STATUS_LABEL } from "@/lib/constants/labels";
import { PAYROLL_RUN_STATUS_TONE } from "@/lib/constants/status-config";
import type { PayrollRun } from "@/lib/db/payroll";
import { formatDate, formatMoney } from "@/lib/format";
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

export function PayrollRunsTable({ rows }: { rows: PayrollRun[] }) {
  return (
    <Table className="min-w-[720px] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Run</TableHead>
          <TableHead>Period</TableHead>
          <TableHead className="w-32">Status</TableHead>
          <TableHead className="w-36">
            <span data-align="right" className="block">
              Total
            </span>
          </TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((run) => (
          <LinkedTableRow key={run.id} href={`/admin/payroll/${run.id}`}>
            <TableCell>
              <Link
                href={`/admin/payroll/${run.id}`}
                className="font-mono text-sm font-medium hover:underline"
              >
                {run.run_number}
              </Link>
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(run.period_start)} – {formatDate(run.period_end)}
            </TableCell>
            <TableCell>
              <Badge tone={PAYROLL_RUN_STATUS_TONE[run.status]}>
                {PAYROLL_RUN_STATUS_LABEL[run.status]}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {run.status === "DRAFT" ? "—" : formatMoney(run.total_amount)}
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
