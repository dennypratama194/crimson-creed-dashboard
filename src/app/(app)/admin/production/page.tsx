import type { Metadata } from "next";
import { Banknote, FlaskConical, Plus } from "lucide-react";

import { requireSuperAdmin } from "@/lib/auth/session";
import { listMemberOptions } from "@/lib/db/members";
import {
  getAssignableProducts,
  listAdminProductionAssignments,
} from "@/lib/db/production";
import {
  PRODUCTION_LIST_SCOPES,
  type ProductionListScope,
} from "@/lib/validation/production";
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

  const page = Math.max(1, Number(one(sp.page)) || 1);
  const rawScope = one(sp.scope);
  const scope: ProductionListScope = (
    PRODUCTION_LIST_SCOPES as readonly string[]
  ).includes(rawScope ?? "")
    ? (rawScope as ProductionListScope)
    : "all";
  const search = one(sp.q) ?? undefined;

  const [assignments, unpaid, members, products] = await Promise.all([
    listAdminProductionAssignments({ page, scope, search }),
    listAdminProductionAssignments({ page: 1, scope: "unpaid" }),
    listMemberOptions(),
    getAssignableProducts(),
  ]);

  const canAssign = products.length > 0 && members.length > 0;
  const assignTrigger = (
    <Button disabled={!canAssign}>
      <Plus aria-hidden />
      Assign production
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Production"
        description="Who is in charge of what, and whether they have been paid. The paid flag is a record only — it posts nothing to company cash."
        actions={
          canAssign ? (
            <AssignDialog
              members={members}
              products={products}
              trigger={assignTrigger}
            />
          ) : (
            assignTrigger
          )
        }
      />

      <div className="flex flex-col gap-6">
        <DirtyMoneyNote scope="production" />

        <div className="grid gap-4 sm:grid-cols-2">
          <KpiCard
            label="Awaiting payment"
            value={String(unpaid.total)}
            icon={Banknote}
            hint="Assignments not yet marked paid"
          />
          <KpiCard
            label="Products"
            value={String(products.length)}
            icon={FlaskConical}
            hint="Items production can be assigned against"
          />
        </div>

        <section className="flex flex-col gap-4">
          <ProductionFilterBar />

          {assignments.rows.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title={scope === "all" ? "No assignments yet" : "Nothing here"}
              description={
                products.length === 0
                  ? "No PRODUCT items exist yet. Add one under Items before assigning production."
                  : scope === "all"
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
