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
import { getCurrentMember } from "@/lib/auth/session";
import { getCashBalance, getCashSummary, listCashEntries } from "@/lib/db/cash";
import { listSuperAdmins } from "@/lib/db/members";
import { formatMoney, formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CashFilterBar } from "@/app/(app)/admin/cash/cash-filter-bar";
import { LedgerTable } from "@/app/(app)/admin/cash/ledger-table";
import { MonthPicker } from "@/app/(app)/admin/cash/month-picker";
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

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** [from, to) covering the calendar month `YYYY-MM`, in UTC. */
function monthRange(month: string): { from: string; to: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    to: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
}

export default async function CashPage({
  searchParams,
}: PageProps<"/admin/cash">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const direction = pick<CashDirection>(one(sp.direction), CASH_DIRECTIONS);
  const category = pick<CashCategory>(one(sp.category), CASH_CATEGORIES);
  const source = pick<CashEntrySource>(one(sp.source), CASH_ENTRY_SOURCES);

  const nowMonth = currentMonth();
  const rawMonth = one(sp.month);
  const month =
    /^\d{4}-\d{2}$/.test(rawMonth ?? "") && (rawMonth as string) <= nowMonth
      ? (rawMonth as string)
      : nowMonth;
  const isCurrentMonth = month === nowMonth;

  const { from, to } = monthRange(month);
  const [balance, summary, ledger, admins, currentMember] = await Promise.all([
    getCashBalance(),
    getCashSummary({ from, to }),
    listCashEntries({ page, direction, category, source }),
    listSuperAdmins(),
    getCurrentMember(),
  ]);

  const isFiltered = !!direction || !!category || !!source;

  return (
    <>
      <PageHeader
        title="Company cash"
        description="The company treasury. Every income and expense adjusts the balance."
        actions={
          <RecordEntryDialog
            admins={admins}
            defaultHandledById={currentMember?.id}
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

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              {isCurrentMonth ? "This month" : formatMonth(month)}
            </h2>
            <MonthPicker value={month} max={nowMonth} />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <KpiCard
              label="Income"
              value={formatMoney(summary.incomeTotal)}
              icon={TrendingUp}
            />
            <KpiCard
              label="Expense"
              value={formatMoney(summary.expenseTotal)}
              icon={TrendingDown}
            />
            <KpiCard
              label="Net"
              className="col-span-2 sm:col-span-1"
              value={
                <span className={cn(summary.net < 0 && "text-tone-error-fg")}>
                  {summary.net >= 0 ? "" : "−"}
                  {formatMoney(Math.abs(summary.net))}
                </span>
              }
            />
          </div>
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
                    admins={admins}
                    defaultHandledById={currentMember?.id}
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
