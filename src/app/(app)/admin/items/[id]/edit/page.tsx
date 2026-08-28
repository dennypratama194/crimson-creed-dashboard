import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getItem } from "@/lib/db/items";
import { PageHeader } from "@/components/patterns/page-header";
import { ItemForm } from "@/app/(app)/admin/items/item-form";

export const metadata: Metadata = { title: "Edit item" };

export default async function EditItemPage({
  params,
}: PageProps<"/admin/items/[id]/edit">) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  return (
    <>
      <PageHeader
        title={item.name}
        description="Editing does not change any past orders — their prices and names are snapshots."
      />
      <ItemForm item={item} />
    </>
  );
}
