import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <PagePlaceholder
      title="Notifications"
      description="Order, payment and distribution updates."
      phase={8}
    />
  );
}
