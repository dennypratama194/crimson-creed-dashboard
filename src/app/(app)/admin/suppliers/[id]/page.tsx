import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  getSupplier,
  getSupplierCatalogue,
  listCatalogueItemsForPicker,
} from "@/lib/db/suppliers";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupplierRowActions } from "@/app/(app)/admin/suppliers/supplier-row-actions";
import { SupplierCatalogueEditor } from "@/app/(app)/admin/suppliers/[id]/supplier-catalogue-editor";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDetailPage({
  params,
}: PageProps<"/admin/suppliers/[id]">) {
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const [lines, pickerItems] = await Promise.all([
    getSupplierCatalogue(supplier.id),
    listCatalogueItemsForPicker(),
  ]);

  const soldToMembers = lines.filter((l) => l.sell_price !== null).length;

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
            <Row label="Code">
              <span className="font-mono text-xs">{supplier.code}</span>
            </Row>
            <Row label="Contact">
              <span>{supplier.contact ?? "—"}</span>
            </Row>
            <Row label="Items listed">
              <span className="tabular-nums">{lines.length}</span>
            </Row>
            <Row label="Sold to members">
              <span className="tabular-nums">{soldToMembers}</span>
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
            <CardContent className="pt-6">
              <SupplierCatalogueEditor
                supplierId={supplier.id}
                supplierArchived={supplier.archived_at !== null}
                lines={lines}
                pickerItems={pickerItems}
              />
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
