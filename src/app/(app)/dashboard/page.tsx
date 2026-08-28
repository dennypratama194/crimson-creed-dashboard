import type { Metadata } from "next";

import { getCurrentMember } from "@/lib/auth/session";
import { APP_ROLE_LABEL, MEMBER_RANK_LABEL } from "@/lib/constants/labels";

export const metadata: Metadata = { title: "Dashboard" };

/** Placeholder — replaced by the role-aware dashboards in Phase 11. */
export default async function DashboardPage() {
  const member = await getCurrentMember();

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground">
        Signed in as <strong>{member?.display_name}</strong> —{" "}
        {member ? APP_ROLE_LABEL[member.role] : ""}
        {member ? `, ${MEMBER_RANK_LABEL[member.rank]}` : ""}.
      </p>
      <p className="text-sm text-muted-foreground">
        The application shell and dashboards are built in later phases.
      </p>
    </div>
  );
}
