import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireSuperAdmin } from "@/lib/auth/session";
import { getSupplier, getSupplierCatalogue } from "@/lib/db/suppliers";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupplierRowActions } from "@/app/(app)/admin/suppliers/supplier-row-actions";
import { SupplierCatalogueEditor } from "@/app/(app)/admin/suppliers/[id]/supplier-catalogue-editor";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/suppliers/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;

  // A page renders alongside the admin layout, not after it: authorize before
  // calling an admin-only RPC (memoized — the layout's check is reused). Then
  // the two reads are independent; an unknown supplier simply has no lines.
  await requireSuperAdmin();
  const [supplier, catalogue] = await Promise.all([
    getSupplier(id),
    getSupplierCatalogue(id, { page: pageParam }),
  ]);
  if (!supplier) notFound();

  function statusBadge() {
    if (supplier!.archived_at) return <Badge tone="gray">Archived</Badge>;
    if (!supplier!.active) return <Badge tone="warning">Inactive</Badge>;
    return <Badge tone="success">Active</Badge>;
  }

  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/suppliers">
            <ArrowLeft aria-hidden />
            Suppliers
          </Link>
        </Button>
      </div>

      <PageHeader
        title={supplier.name}
        description={`Added ${formatDate(supplier.created_at)}`}
        actions={<SupplierRowActions supplier={supplier} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-4 text-sm">
            <Row label="Status">{statusBadge()}</Row>
            <Row label="Contact">
              <span>{supplier.contact ?? "—"}</span>
            </Row>
            <Row label="Items listed">
              <span className="tabular-nums">{catalogue.total}</span>
            </Row>
            <Row label="Sold to members">
              <span className="tabular-nums">{catalogue.soldToMembers}</span>
            </Row>
            {supplier.notes ? (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                <span className="text-muted-foreground">Notes</span>
                <p className="whitespace-pre-wrap">{supplier.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <SupplierCatalogueEditor
                supplierId={supplier.id}
                supplierArchived={supplier.archived_at !== null}
                lines={catalogue.rows}
                total={catalogue.total}
              />
              {catalogue.total > catalogue.pageSize ? (
                <Pagination
                  page={catalogue.page}
                  pageSize={catalogue.pageSize}
                  total={catalogue.total}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
