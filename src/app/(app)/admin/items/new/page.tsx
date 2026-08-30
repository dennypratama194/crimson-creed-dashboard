import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { ItemForm } from "@/app/(app)/admin/items/item-form";

export const metadata: Metadata = { title: "New item" };

export default function NewItemPage() {
  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/items">
            <ArrowLeft aria-hidden />
            Items
          </Link>
        </Button>
      </div>

      <PageHeader
        title="New item"
        description="Add an item to the catalogue."
      />
      <ItemForm />
    </>
  );
}
