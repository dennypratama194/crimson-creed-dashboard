import type { Metadata } from "next";
import { Banknote, Plus, TrendingDown, TrendingUp } from "lucide-react";

import {
  CASH_CATEGORIES,
  CASH_DIRECTIONS,
  CASH_ENTRY_SOURCES,
  type CashCategory,
  type CashDirection,
  type CashEntrySource,
} from "@/lib/constants/enums";
import { getCashBalance, getCashSummary, listCashEntries } from "@/lib/db/cash";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CashFilterBar } from "@/app/(app)/admin/cash/cash-filter-bar";
import { LedgerTable } from "@/app/(app)/admin/cash/ledger-table";
import { RecordEntryDialog } from "@/app/(app)/admin/cash/record-entry-dialog";

export const metadata: Metadata = { title: "Company cash" };

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return (allowed as readonly string[]).includes(raw ?? "")
    ? (raw as T)
    : undefined;
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async function CashPage({
  searchParams,
}: PageProps<"/admin/cash">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const direction = pick<CashDirection>(one(sp.direction), CASH_DIRECTIONS);
  const category = pick<CashCategory>(one(sp.category), CASH_CATEGORIES);
  const source = pick<CashEntrySource>(one(sp.source), CASH_ENTRY_SOURCES);

  const { from, to } = monthRange();
  const [balance, summary, ledger] = await Promise.all([
    getCashBalance(),
    getCashSummary({ from, to }),
    listCashEntries({ page, direction, category, source }),
  ]);

  const isFiltered = !!direction || !!category || !!source;

  return (
    <>
      <PageHeader
        title="Company cash"
        description="The company treasury. Every income and expense adjusts the balance."
        actions={
          <RecordEntryDialog
            trigger={
              <Button>
                <Plus aria-hidden />
                Record entry
              </Button>
            }
          />
        }
      />

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-1 p-5 sm:p-6">
          <span className="text-sm text-muted-foreground">Current balance</span>
          <span
            className={cn(
              "text-4xl font-semibold tracking-tight tabular-nums",
              balance < 0 && "text-tone-error-fg",
            )}
          >
            {formatMoney(balance)}
          </span>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Income this month"
            value={formatMoney(summary.incomeTotal)}
            icon={TrendingUp}
          />
          <KpiCard
            label="Expense this month"
            value={formatMoney(summary.expenseTotal)}
            icon={TrendingDown}
          />
          <KpiCard
            label="Net this month"
            value={
              <span className={cn(summary.net < 0 && "text-tone-error-fg")}>
                {summary.net >= 0 ? "" : "−"}
                {formatMoney(Math.abs(summary.net))}
              </span>
            }
          />
        </div>

        <div className="flex flex-col gap-4">
          <CashFilterBar />

          {ledger.rows.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title={isFiltered ? "No entries match" : "No cash entries yet"}
              description={
                isFiltered
                  ? "Try clearing a filter."
                  : "Record income or an expense to start the ledger."
              }
              action={
                isFiltered ? undefined : (
                  <RecordEntryDialog
                    trigger={
                      <Button variant="secondary">
                        <Plus aria-hidden />
                        Record entry
                      </Button>
                    }
                  />
                )
              }
            />
          ) : (
            <>
              <Card className="overflow-x-auto p-0">
                <LedgerTable rows={ledger.rows} />
              </Card>
              <Pagination
                page={ledger.page}
                pageSize={ledger.pageSize}
                total={ledger.total}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
