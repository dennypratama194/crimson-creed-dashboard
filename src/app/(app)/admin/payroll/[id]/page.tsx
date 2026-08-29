import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";

import { PAYROLL_RUN_STATUS_LABEL } from "@/lib/constants/labels";
import { PAYROLL_RUN_STATUS_TONE } from "@/lib/constants/status-config";
import { getPayrollRunDetail, previewPayrollPeriod } from "@/lib/db/payroll";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PayrollRunActions } from "@/app/(app)/admin/payroll/[id]/payroll-run-actions";

export const metadata: Metadata = { title: "Payroll run" };

export default async function PayrollRunPage({
  params,
}: PageProps<"/admin/payroll/[id]">) {
  const { id } = await params;
  const detail = await getPayrollRunDetail(id);
  if (!detail) notFound();

  const { run, lines } = detail;
  const isDraft = run.status === "DRAFT";
  const preview = isDraft
    ? await previewPayrollPeriod(run.period_start, run.period_end)
    : null;

  const tableRows = isDraft
    ? (preview?.lines ?? []).map((l) => ({
        key: l.member_id,
        name: l.member_name,
        logCount: l.log_count,
        amount: l.gross_amount,
      }))
    : lines.map((l) => ({
        key: l.id,
        name: l.member_name_snapshot,
        logCount: l.log_count,
        amount: l.gross_amount,
      }));

  const total = isDraft ? (preview?.total ?? 0) : run.total_amount;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono">{run.run_number}</span>
            <Badge tone={PAYROLL_RUN_STATUS_TONE[run.status]}>
              {PAYROLL_RUN_STATUS_LABEL[run.status]}
            </Badge>
          </span>
        }
        description={`${formatDate(run.period_start)} – ${formatDate(run.period_end)}`}
        actions={
          <PayrollRunActions runId={run.id} status={run.status} total={total} />
        }
      />

      <div className="flex flex-col gap-6">
        <Card className="grid gap-4 p-5 sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {isDraft ? "Projected total" : "Total"}
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatMoney(total)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Members</span>
            <span className="text-2xl font-semibold tabular-nums">
              {tableRows.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            <span>Opened {formatDateTime(run.created_at)}</span>
            {run.finalized_at ? (
              <span>Finalized {formatDateTime(run.finalized_at)}</span>
            ) : null}
            {run.paid_at ? (
              <span>Paid {formatDateTime(run.paid_at)}</span>
            ) : null}
          </div>
        </Card>

        {run.note ? (
          <p className="text-sm text-muted-foreground">{run.note}</p>
        ) : null}

        {isDraft ? (
          <p className="rounded-md border border-tone-info-border bg-tone-info-bg px-3 py-2 text-sm text-tone-info-fg">
            Draft — these are the approved logs that will be rolled up when you
            finalize. Logs approved later but still dated in this period are
            included too.
          </p>
        ) : null}

        {tableRows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No approved production in this period"
            description={
              isDraft
                ? "Nothing will be paid out. Approve some logs first, or adjust the period."
                : "This run was finalized with no member lines."
            }
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="w-28">
                    <span data-align="right" className="block">
                      Logs
                    </span>
                  </TableHead>
                  <TableHead className="w-40">
                    <span data-align="right" className="block">
                      Amount
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.logCount}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoney(total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
