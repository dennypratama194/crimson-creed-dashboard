import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <PagePlaceholder
      title="Orders"
      description="Your orders and their status."
      phase={5}
    />
  );
}
