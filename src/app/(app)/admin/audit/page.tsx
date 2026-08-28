import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "Audit log" };

export default function AdminAuditPage() {
  return (
    <PagePlaceholder
      title="Audit log"
      description="Append-only record of sensitive actions."
      phase={10}
    />
  );
}
