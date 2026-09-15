import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  Coins,
  PackageCheck,
  Plus,
  Settings2,
} from "lucide-react";

import { requireSuperAdmin } from "@/lib/auth/session";
import {
  getDistributionSummary,
  getDrawableItems,
  listAdminDistributions,
} from "@/lib/db/distribution";
import { listMemberOptions } from "@/lib/db/members";
import { formatMoney } from "@/lib/format";
import {
  DRAW_LIST_SCOPES,
  type DrawListScope,
} from "@/lib/validation/distribution";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { DirtyMoneyNote } from "@/components/patterns/dirty-money-note";
import { DistributionTable } from "@/app/(app)/admin/distribution/distribution-table";
import { DistributionFilterBar } from "@/app/(app)/admin/distribution/distribution-filter-bar";
import { IssueDrawDialog } from "@/app/(app)/admin/distribution/issue-draw-dialog";

export const metadata: Metadata = { title: "Distribution" };

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminDistributionPage({
  searchParams,
}: PageProps<"/admin/distribution">) {
  await requireSuperAdmin();
  const sp = await searchParams;

  const page = Math.max(1, Number(one(sp.page)) || 1);
  const rawScope = one(sp.scope);
  const scope: DrawListScope = (DRAW_LIST_SCOPES as readonly string[]).includes(
    rawScope ?? "",
  )
    ? (rawScope as DrawListScope)
    : "all";
  const search = one(sp.q) ?? undefined;

  const [draws, summary, members, items] = await Promise.all([
    listAdminDistributions({ page, scope, search }),
    getDistributionSummary(),
    listMemberOptions(),
    getDrawableItems(),
  ]);

  const canIssue = items.length > 0 && members.length > 0;

  const issueTrigger = (
    <Button disabled={!canIssue}>
      <Plus aria-hidden />
      Record draw
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Distribution"
        description="Stock drawn from the stash and what each member owes back. Recording a draw reduces the stash; marking one done does not post to company cash."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" asChild>
              <Link href="/admin/distribution/rates">
                <Settings2 aria-hidden />
                Company cut
              </Link>
            </Button>
            {canIssue ? (
              <IssueDrawDialog
                members={members}
                items={items}
                trigger={issueTrigger}
              />
            ) : (
              issueTrigger
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <DirtyMoneyNote scope="distribution" />

        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Submitted"
            value={formatMoney(summary.settledAmount)}
            icon={CheckCircle2}
            hint={`Dirty money · ${summary.settledDraws} draw${summary.settledDraws === 1 ? "" : "s"} handed back`}
          />
          <KpiCard
            label="Outstanding"
            value={formatMoney(summary.openAmount)}
            icon={Coins}
            hint={`Dirty money · ${summary.openDraws} draw${summary.openDraws === 1 ? "" : "s"} in progress`}
          />
          <KpiCard
            label="Drawable items"
            value={String(items.length)}
            icon={PackageCheck}
            hint="Stash items with a company cut set"
          />
        </div>

        <section className="flex flex-col gap-4">
          <DistributionFilterBar />

          {draws.rows.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title={scope === "all" ? "No draws recorded yet" : "Nothing here"}
              description={
                items.length === 0
                  ? "No stash item has a company cut yet. Set one under Company cut before recording a draw."
                  : scope === "all"
                    ? "Record a draw when a member takes stock out to sell."
                    : "No draws match this filter."
              }
            />
          ) : (
            <>
              <DistributionTable rows={draws.rows} />
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
