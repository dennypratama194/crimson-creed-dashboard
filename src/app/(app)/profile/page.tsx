import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentMember } from "@/lib/auth/session";
import {
  APP_ROLE_LABEL,
  MEMBER_RANK_LABEL,
  MEMBER_STATUS_LABEL,
} from "@/lib/constants/labels";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/patterns/page-header";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/app/(app)/profile/change-password-form";
import { DisplayNameForm } from "@/app/(app)/profile/display-name-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const member = await getCurrentMember();
  if (!member) notFound();

  return (
    <>
      <PageHeader title="Profile" description="Your account details." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-4 text-sm">
            <Row label="Username">
              <span className="font-mono text-xs">@{member.username}</span>
            </Row>
            <Row label="Rank">{MEMBER_RANK_LABEL[member.rank]}</Row>
            <Row label="Role">{APP_ROLE_LABEL[member.role]}</Row>
            <Row label="Status">
              <Badge tone={member.status === "ACTIVE" ? "success" : "gray"}>
                {MEMBER_STATUS_LABEL[member.status]}
              </Badge>
            </Row>
            <Row label="Joined">{formatDate(member.created_at)}</Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Display name</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <DisplayNameForm current={member.display_name} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <ChangePasswordForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between pt-4 text-sm">
            <span className="text-muted-foreground">Theme</span>
            <ThemeToggle />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
