import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "Items" };

export default function AdminItemsPage() {
  return (
    <PagePlaceholder
      title="Item catalogue"
      description="Categories, prices, and orderable state."
      phase={4}
    />
  );
}
