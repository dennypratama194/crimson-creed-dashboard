import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getSupplier } from "@/lib/db/suppliers";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { SupplierForm } from "@/app/(app)/admin/suppliers/supplier-form";

export const metadata: Metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({
  params,
}: PageProps<"/admin/suppliers/[id]/edit">) {
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/admin/suppliers/${supplier.id}`}>
            <ArrowLeft aria-hidden />
            {supplier.name}
          </Link>
        </Button>
      </div>

      <PageHeader
        title={`Edit ${supplier.name}`}
        description="Renaming or deactivating a supplier does not touch its price-book lines."
      />
      <SupplierForm supplier={supplier} />
    </>
  );
}
