import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { ItemForm } from "@/app/(app)/admin/items/item-form";

export const metadata: Metadata = { title: "New item" };

export default function NewItemPage() {
  return (
    <>
      <PageHeader
        title="New item"
        description="Add an item to the catalogue."
      />
      <ItemForm />
    </>
  );
}
