import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";

import { listPayrollRuns } from "@/lib/db/payroll";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { PayrollRunsTable } from "@/app/(app)/admin/payroll/runs-table";

export const metadata: Metadata = { title: "Payroll" };

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PayrollPage({
  searchParams,
}: PageProps<"/admin/payroll">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const {
    rows,
    total,
    page: current,
    pageSize,
  } = await listPayrollRuns({
    page,
  });

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Roll approved production into per-member pay for a period, then mark it paid."
        actions={
          <Button asChild>
            <Link href="/admin/payroll/new">
              <Plus aria-hidden />
              New run
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payroll runs yet"
            description="Open a run for a pay period to roll up approved production logs."
            action={
              <Button asChild variant="secondary">
                <Link href="/admin/payroll/new">
                  <Plus aria-hidden />
                  New run
                </Link>
              </Button>
            }
          />
        ) : (
          <>
            <PayrollRunsTable rows={rows} />
            <Pagination page={current} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
