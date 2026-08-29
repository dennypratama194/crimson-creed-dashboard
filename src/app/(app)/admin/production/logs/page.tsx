import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";

import {
  PRODUCTION_LOG_STATUSES,
  type ProductionLogStatus,
} from "@/lib/constants/enums";
import { listAdminProductionLogs } from "@/lib/db/production";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { LogsFilterBar } from "@/app/(app)/admin/production/logs/logs-filter-bar";
import { ProductionReviewTable } from "@/app/(app)/admin/production/logs/production-review-table";

export const metadata: Metadata = { title: "Production review" };

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductionLogsPage({
  searchParams,
}: PageProps<"/admin/production/logs">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.q) ?? "";
  const rawStatus = one(sp.status);
  const status = (PRODUCTION_LOG_STATUSES as readonly string[]).includes(
    rawStatus ?? "",
  )
    ? (rawStatus as ProductionLogStatus)
    : undefined;

  const {
    rows,
    total,
    page: current,
    pageSize,
  } = await listAdminProductionLogs({ page, search, status });

  const isFiltered = search !== "" || !!status;

  return (
    <>
      <PageHeader
        title="Production review"
        description="Verify member-logged production before it counts towards pay."
      />

      <div className="flex flex-col gap-4">
        <LogsFilterBar />

        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={isFiltered ? "No logs match" : "Nothing to review"}
            description={
              isFiltered
                ? "Try clearing a filter."
                : "Production logged by members shows up here for review."
            }
          />
        ) : (
          <>
            <ProductionReviewTable rows={rows} />
            <Pagination page={current} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
