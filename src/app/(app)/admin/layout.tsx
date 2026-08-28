import type { ReactNode } from "react";

import { requireSuperAdmin } from "@/lib/auth/session";

/** Every /admin/* route requires an ACTIVE Super Admin (PRD §3, §24). */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSuperAdmin();
  return <>{children}</>;
}
