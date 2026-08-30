import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { SupplierForm } from "@/app/(app)/admin/suppliers/supplier-form";

export const metadata: Metadata = { title: "New supplier" };

export default function NewSupplierPage() {
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
        title="New supplier"
        description="Add a source, then map catalogue items to it with their prices."
      />
      <SupplierForm />
    </>
  );
}
