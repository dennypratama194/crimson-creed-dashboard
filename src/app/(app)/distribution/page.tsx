import type { Metadata, Route } from "next";
import Link from "next/link";
import { CheckCircle2, Coins, PackageCheck } from "lucide-react";

import { requireActiveMember } from "@/lib/auth/session";
import {
  getMyDistributionSummary,
  listMyDistributions,
} from "@/lib/db/distribution";
import { formatMoney } from "@/lib/format";
import {
  DRAW_LIST_SCOPES,
  type DrawListScope,
} from "@/lib/validation/distribution";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { cn } from "@/lib/utils";
import { DirtyMoneyNote } from "@/components/patterns/dirty-money-note";
import { MyDrawsTable } from "@/app/(app)/distribution/my-draws-table";

export const metadata: Metadata = { title: "Distribution" };

const SCOPE_LABEL: Record<DrawListScope, string> = {
  all: "All",
  open: "In progress",
  settled: "Done",
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DistributionPage({
  searchParams,
}: PageProps<"/distribution">) {
  const [member, sp] = await Promise.all([requireActiveMember(), searchParams]);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const rawScope = one(sp.scope);
  const scope: DrawListScope = (DRAW_LIST_SCOPES as readonly string[]).includes(
    rawScope ?? "",
  )
    ? (rawScope as DrawListScope)
    : "all";

  const [draws, summary] = await Promise.all([
    listMyDistributions({ memberId: member.id, page, scope }),
    getMyDistributionSummary(),
  ]);

  return (
    <>
      <PageHeader
        title="Distribution"
        description="Stock you have taken from the stash and what you still owe the company. A Super Admin records the hand-back."
      />

      <div className="flex flex-col gap-6">
        <DirtyMoneyNote scope="distribution" />

        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            label="You owe"
            value={formatMoney(summary.openAmount)}
            icon={Coins}
            hint={`Dirty money · ${summary.openDraws} draw${summary.openDraws === 1 ? "" : "s"} in progress`}
          />
          <KpiCard
            label="Settled"
            value={formatMoney(summary.settledAmount)}
            icon={CheckCircle2}
            hint={`Dirty money · ${summary.settledDraws} draw${summary.settledDraws === 1 ? "" : "s"} done`}
          />
        </div>

        <section className="flex flex-col gap-4">
          <div
            role="tablist"
            aria-label="Filter draws"
            className="inline-flex w-fit rounded-lg border border-border p-0.5 text-sm"
          >
            {DRAW_LIST_SCOPES.map((value) => {
              const active = value === scope;
              const href = (
                value === "all"
                  ? "/distribution"
                  : `/distribution?scope=${value}`
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

          {draws.rows.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title={
                scope === "all"
                  ? "You have not taken any stock"
                  : "Nothing here"
              }
              description={
                scope === "all"
                  ? "When a Super Admin releases stock to you, it shows up here with what you owe back."
                  : "No draws match this filter."
              }
            />
          ) : (
            <>
              <MyDrawsTable rows={draws.rows} />
              <Pagination
                page={draws.page}
                pageSize={draws.pageSize}
                total={draws.total}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
