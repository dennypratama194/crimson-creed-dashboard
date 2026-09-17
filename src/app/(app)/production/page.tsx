import type { Metadata, Route } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";

import { requireActiveMember } from "@/lib/auth/session";
import { listMyProductionAssignments } from "@/lib/db/production";
import {
  PRODUCTION_LIST_SCOPES,
  type ProductionListScope,
} from "@/lib/validation/production";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { cn } from "@/lib/utils";
import { clampPage } from "@/lib/db/paging";
import { DirtyMoneyNote } from "@/components/patterns/dirty-money-note";
import { MyAssignmentsTable } from "@/app/(app)/production/my-assignments-table";

export const metadata: Metadata = { title: "Production" };

const SCOPE_LABEL: Record<ProductionListScope, string> = {
  all: "All",
  unpaid: "Not paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProductionPage({
  searchParams,
}: PageProps<"/production">) {
  // requireActiveMember is the gate; the list RPC scopes itself to the caller.
  const [, sp] = await Promise.all([requireActiveMember(), searchParams]);
  const page = clampPage(one(sp.page));
  const rawScope = one(sp.scope);
  const scope: ProductionListScope = (
    PRODUCTION_LIST_SCOPES as readonly string[]
  ).includes(rawScope ?? "")
    ? (rawScope as ProductionListScope)
    : "all";

  // The RPC behind this is caller-scoped in SQL; there is no member id to pass.
  const assignments = await listMyProductionAssignments({ page, scope });

  return (
    <>
      <PageHeader
        title="Production"
        description="Jobs a Super Admin has put you in charge of. This view is read-only."
      />

      <section className="flex flex-col gap-4">
        <DirtyMoneyNote scope="production" />

        <div
          role="tablist"
          aria-label="Filter assignments"
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

        {assignments.rows.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title={
              scope === "all" ? "No production assigned to you" : "Nothing here"
            }
            description={
              scope === "all"
                ? "When a Super Admin puts you in charge of a job, it appears here."
                : "No assignments match this filter."
            }
          />
        ) : (
          <>
            <MyAssignmentsTable rows={assignments.rows} />
            <Pagination
              page={assignments.page}
              pageSize={assignments.pageSize}
              total={assignments.total}
            />
          </>
        )}
      </section>
    </>
  );
}
