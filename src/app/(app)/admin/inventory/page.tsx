import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "Inventory" };

export default function AdminInventoryPage() {
  return (
    <PagePlaceholder
      title="Inventory"
      description="Current stock, movements, and adjustments."
      phase={7}
    />
  );
}
