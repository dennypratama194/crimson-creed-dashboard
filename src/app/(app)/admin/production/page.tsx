import type { Metadata } from "next";
import { Banknote, FlaskConical, Plus } from "lucide-react";

import { requireSuperAdmin } from "@/lib/auth/session";
import {
  countAdminProductionAssignments,
  countAssignableProducts,
  listAdminProductionAssignments,
} from "@/lib/db/production";
import {
  PRODUCTION_LIST_SCOPES,
  type ProductionListScope,
} from "@/lib/validation/production";
import { clampPage } from "@/lib/db/paging";
import { EmptyState } from "@/components/patterns/empty-state";
import { KpiCard } from "@/components/patterns/kpi-card";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { DirtyMoneyNote } from "@/components/patterns/dirty-money-note";
import { AssignDialog } from "@/app/(app)/admin/production/assign-dialog";
import { AssignmentsTable } from "@/app/(app)/admin/production/assignments-table";
import { ProductionFilterBar } from "@/app/(app)/admin/production/production-filter-bar";

export const metadata: Metadata = { title: "Production" };

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminProductionPage({
  searchParams,
}: PageProps<"/admin/production">) {
  await requireSuperAdmin();
  const sp = await searchParams;

  const page = clampPage(one(sp.page));
  const rawScope = one(sp.scope);
  const scope: ProductionListScope = (
    PRODUCTION_LIST_SCOPES as readonly string[]
  ).includes(rawScope ?? "")
    ? (rawScope as ProductionListScope)
    : "all";
  const search = one(sp.q) ?? undefined;

  const [assignments, unpaidCount, productCount] = await Promise.all([
    listAdminProductionAssignments({ page, scope, search }),
    countAdminProductionAssignments({ scope: "unpaid" }),
    countAssignableProducts(),
  ]);

  const assignTrigger = (
    <Button>
      <Plus aria-hidden />
      Assign production
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Production"
        description="Who is in charge of what, and whether they have been paid. The paid flag is a record only — it posts nothing to company cash."
        actions={<AssignDialog trigger={assignTrigger} />}
      />

      <div className="flex flex-col gap-6">
        <DirtyMoneyNote scope="production" />

        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            label="Awaiting payment"
            value={String(unpaidCount)}
            icon={Banknote}
            hint="Assignments not yet marked paid"
          />
          <KpiCard
            label="Products"
            value={String(productCount)}
            icon={FlaskConical}
            hint="Products that can be assigned"
          />
        </div>

        <section className="flex flex-col gap-4">
          <ProductionFilterBar />

          {assignments.rows.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title={scope === "all" ? "No assignments yet" : "Nothing here"}
              description={
                scope === "all"
                  ? "Assign a member to a production job to start tracking it."
                  : "No assignments match this filter."
              }
            />
          ) : (
            <>
              <AssignmentsTable rows={assignments.rows} />
              <Pagination
                page={assignments.page}
                pageSize={assignments.pageSize}
                total={assignments.total}
              />
            </>
          )}
        </section>
      </div>
    </>
  );
}
