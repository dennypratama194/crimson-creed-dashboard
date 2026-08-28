import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "Members" };

export default function AdminMembersPage() {
  return (
    <PagePlaceholder
      title="Members"
      description="Create, edit and deactivate member accounts."
      phase={9}
    />
  );
}
