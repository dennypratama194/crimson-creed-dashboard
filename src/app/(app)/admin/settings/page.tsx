import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  return (
    <PagePlaceholder
      title="Settings"
      description="Organization name, logo, and defaults."
      phase={12}
    />
  );
}
