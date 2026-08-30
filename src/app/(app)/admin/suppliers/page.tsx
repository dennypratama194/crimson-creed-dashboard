import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";

import { listSupplierGroups, listSuppliers } from "@/lib/db/suppliers";
import {
  SUPPLIER_LIST_SORTS,
  SUPPLIER_LIST_STATUSES,
  type SupplierListSort,
  type SupplierListStatus,
} from "@/lib/validation/supplier";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { SupplierCatalogue } from "@/app/(app)/admin/suppliers/supplier-catalogue";
import { SuppliersFilterBar } from "@/app/(app)/admin/suppliers/suppliers-filter-bar";
import { SuppliersTable } from "@/app/(app)/admin/suppliers/suppliers-table";

export const metadata: Metadata = { title: "Suppliers" };

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminSuppliersPage({
  searchParams,
}: PageProps<"/admin/suppliers">) {
  const sp = await searchParams;
  const view = one(sp.view) === "catalogue" ? "catalogue" : "list";

  const tabs = (
    <div className="flex rounded-md border border-border p-0.5 text-sm">
      <Link
        href="/admin/suppliers"
        data-active={view === "list"}
        className="rounded px-3 py-1 text-muted-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground"
      >
        List
      </Link>
      <Link
        href="/admin/suppliers?view=catalogue"
        data-active={view === "catalogue"}
        className="rounded px-3 py-1 text-muted-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground"
      >
        By supplier
      </Link>
    </div>
  );

  if (view === "catalogue") {
    const groups = await listSupplierGroups();
    return (
      <>
        <PageHeader
          title="Suppliers"
          description="What each supplier carries, with their buy price, sell price and per-order cap."
          actions={tabs}
        />
        {groups.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No suppliers yet"
            description="Add a supplier to start mapping the catalogue."
            action={
              <Button asChild variant="secondary">
                <Link href="/admin/suppliers/new">
                  <Plus aria-hidden />
                  New supplier
                </Link>
              </Button>
            }
          />
        ) : (
          <SupplierCatalogue groups={groups} />
        )}
      </>
    );
  }

  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.q) ?? "";

  const rawStatus = one(sp.status);
  const status: SupplierListStatus = (
    SUPPLIER_LIST_STATUSES as readonly string[]
  ).includes(rawStatus ?? "")
    ? (rawStatus as SupplierListStatus)
    : "all";

  const rawSort = one(sp.sort);
  const sort: SupplierListSort = (
    SUPPLIER_LIST_SORTS as readonly string[]
  ).includes(rawSort ?? "")
    ? (rawSort as SupplierListSort)
    : "name";

  const { rows, total, pageSize } = await listSuppliers({
    page,
    search,
    status,
    sort,
  });

  const isFiltered = search !== "" || status !== "all";

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Who supplies the catalogue, and at what cost. Members never see this."
        actions={
          <div className="flex items-center gap-2">
            {tabs}
            <Button asChild>
              <Link href="/admin/suppliers/new">
                <Plus aria-hidden />
                New supplier
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        <SuppliersFilterBar />

        {rows.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={isFiltered ? "No suppliers match" : "No suppliers yet"}
            description={
              isFiltered
                ? "Try a different search or filter."
                : "Add your first supplier."
            }
            action={
              !isFiltered ? (
                <Button asChild variant="secondary">
                  <Link href="/admin/suppliers/new">
                    <Plus aria-hidden />
                    New supplier
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <SuppliersTable rows={rows} />
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
