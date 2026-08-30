import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { ItemForm } from "@/app/(app)/admin/items/item-form";

export const metadata: Metadata = { title: "New stash item" };

export default function NewStashItemPage() {
  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/inventory">
            <ArrowLeft aria-hidden />
            Company stash
          </Link>
        </Button>
      </div>

      <PageHeader
        title="New stash item"
        description="Track anything the company holds — raw materials, tools, seized property, or a catalogue product."
      />
      <ItemForm
        defaultStockType="RAW_MATERIAL"
        returnTo={"/admin/inventory" as Route}
      />
    </>
  );
}
