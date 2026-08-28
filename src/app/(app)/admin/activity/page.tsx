import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "Activity" };

export default function AdminActivityPage() {
  return (
    <PagePlaceholder
      title="Activity"
      description="Human-readable feed of everything that happens."
      phase={10}
    />
  );
}
