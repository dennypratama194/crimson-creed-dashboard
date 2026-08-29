import type { Metadata, Route } from "next";
import Link from "next/link";
import { Banknote, FlaskConical, Plus, Wallet } from "lucide-react";

import { PAYROLL_RUN_STATUS_LABEL } from "@/lib/constants/labels";
import { PAYROLL_RUN_STATUS_TONE } from "@/lib/constants/status-config";
import {
  getMyEarningsSummary,
  getPayEligibleProducts,
  listMyProductionLogs,
} from "@/lib/db/production";
import { listMyPayslips } from "@/lib/db/payroll";
import {
  PRODUCTION_LIST_SCOPES,
  type ProductionListScope,
} from "@/lib/validation/production";
import { formatDate, formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { LogWorkDialog } from "@/app/(app)/production/log-work-dialog";
import { ProductionLogsTable } from "@/app/(app)/production/production-logs-table";

export const metadata: Metadata = { title: "Production" };

const SCOPE_LABEL: Record<ProductionListScope, string> = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductionPage({
  searchParams,
}: PageProps<"/production">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const rawScope = one(sp.scope);
  const scope: ProductionListScope = (
    PRODUCTION_LIST_SCOPES as readonly string[]
  ).includes(rawScope ?? "")
    ? (rawScope as ProductionListScope)
    : "all";

  const [products, logs, earnings, payslips] = await Promise.all([
    getPayEligibleProducts(),
    listMyProductionLogs({ page, scope }),
    getMyEarningsSummary(),
    listMyPayslips(),
  ]);

  const canLog = products.length > 0;
  const logTrigger = (
    <Button disabled={!canLog}>
      <Plus aria-hidden />
      Log production
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Production"
        description="Log what you process. Pay is piece-rate — set by a Super Admin per product."
        actions={
          canLog ? (
            <LogWorkDialog products={products} trigger={logTrigger} />
          ) : (
            logTrigger
          )
        }
      />

      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Awaiting review"
            value={formatMoney(earnings.pendingAmount)}
            icon={FlaskConical}
            hint={`${earnings.pendingCount} log${earnings.pendingCount === 1 ? "" : "s"} pending`}
          />
          <KpiCard
            label="Approved, not yet paid"
            value={formatMoney(earnings.approvedUnpaidAmount)}
            icon={Wallet}
            hint="Rolls into the next payroll run"
          />
          <KpiCard
            label="Paid out"
            value={formatMoney(earnings.paidAmount)}
            icon={Banknote}
            hint="Across finalized payroll runs"
          />
        </div>

        <section className="flex flex-col gap-4">
          <div
            role="tablist"
            aria-label="Filter logs"
            className="inline-flex w-fit rounded-lg border border-border p-0.5 text-sm"
          >
            {PRODUCTION_LIST_SCOPES.map((value) => {
              const active = value === scope;
              const href = (
                value === "all" ? "/production" : `/production?scope=${value}`
              ) as Route;
              return (
                <Link
                  key={value}
                  href={href}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-medium transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {SCOPE_LABEL[value]}
                </Link>
              );
            })}
          </div>

          {logs.rows.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title={
                scope === "all" ? "No production logged yet" : "Nothing here"
              }
              description={
                !canLog
                  ? "No products have a pay rate yet. Ask a Super Admin to set one."
                  : scope === "all"
                    ? "Log a batch once you have processed some product."
                    : "No logs match this filter."
              }
            />
          ) : (
            <>
              <ProductionLogsTable rows={logs.rows} />
              <Pagination
                page={logs.page}
                pageSize={logs.pageSize}
                total={logs.total}
              />
            </>
          )}
        </section>

        {payslips.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Payslips
            </h2>
            <Card className="overflow-x-auto p-0">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="w-24">
                      <span data-align="right" className="block">
                        Logs
                      </span>
                    </TableHead>
                    <TableHead className="w-32">
                      <span data-align="right" className="block">
                        Amount
                      </span>
                    </TableHead>
                    <TableHead className="w-28">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslips.map((slip) => (
                    <TableRow key={slip.id}>
                      <TableCell className="font-mono text-sm">
                        {slip.run_number}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDate(slip.period_start)} –{" "}
                        {formatDate(slip.period_end)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {slip.log_count}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(slip.gross_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={PAYROLL_RUN_STATUS_TONE[slip.run_status]}>
                          {PAYROLL_RUN_STATUS_LABEL[slip.run_status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        ) : null}
      </div>
    </>
  );
}
