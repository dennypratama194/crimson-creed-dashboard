import type { Metadata } from "next";

import { PagePlaceholder } from "@/components/patterns/page-placeholder";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <PagePlaceholder
      title="Profile"
      description="Your account details and password."
      phase={12}
    />
  );
}
