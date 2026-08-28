import type { Metadata } from "next";

import { requireActiveMember } from "@/lib/auth/session";
import { getAdminDashboard, getMemberDashboard } from "@/lib/db/dashboard";
import { AdminDashboardView } from "@/app/(app)/dashboard/admin-dashboard";
import { MemberDashboardView } from "@/app/(app)/dashboard/member-dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const member = await requireActiveMember();

  if (member.role === "SUPER_ADMIN") {
    const data = await getAdminDashboard();
    return <AdminDashboardView data={data} />;
  }

  const data = await getMemberDashboard();
  return <MemberDashboardView data={data} name={member.display_name} />;
}
