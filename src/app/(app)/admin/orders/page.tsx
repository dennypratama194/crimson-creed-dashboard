import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "All orders" };

export default function AdminOrdersPage() {
  return (
    <PagePlaceholder
      title="Orders"
      description="Every order, with payment and distribution workflow."
      phase={6}
    />
  );
}
