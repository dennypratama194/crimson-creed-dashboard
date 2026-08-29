import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  APP_ROLE_LABEL,
  MEMBER_RANK_LABEL,
  MEMBER_STATUS_LABEL,
} from "@/lib/constants/labels";
import { getMember } from "@/lib/db/members";
import { listOrders } from "@/lib/db/orders";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberForm } from "@/app/(app)/admin/members/member-form";
import { MemberStatusButton } from "@/app/(app)/admin/members/[id]/member-status-button";
import { PasswordResetDialog } from "@/app/(app)/admin/members/[id]/password-reset-dialog";
import { OrdersTable } from "@/app/(app)/orders/orders-table";

export const metadata: Metadata = { title: "Member" };

export default async function MemberDetailPage({
  params,
}: PageProps<"/admin/members/[id]">) {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) notFound();

  const { rows: orders } = await listOrders({ page: 1, memberId: member.id });

  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/members">
            <ArrowLeft aria-hidden />
            Members
          </Link>
        </Button>
      </div>

      <PageHeader
        title={member.display_name}
        description={`@${member.username} · joined ${formatDate(member.created_at)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <PasswordResetDialog memberId={member.id} />
            <MemberStatusButton
              memberId={member.id}
              currentStatus={member.status}
            />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-4 text-sm">
            <Row label="Status">
              <Badge tone={member.status === "ACTIVE" ? "success" : "gray"}>
                {MEMBER_STATUS_LABEL[member.status]}
              </Badge>
            </Row>
            <Row label="Role">
              <Badge tone={member.role === "SUPER_ADMIN" ? "brand" : "gray"}>
                {APP_ROLE_LABEL[member.role]}
              </Badge>
            </Row>
            <Row label="Rank">
              <span>{MEMBER_RANK_LABEL[member.rank]}</span>
            </Row>
            <Row label="Username">
              <span className="font-mono text-xs">@{member.username}</span>
            </Row>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Edit</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <MemberForm member={member} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent orders</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {orders.length === 0 ? (
                <EmptyState
                  title="No orders"
                  description="This member has not placed any orders."
                />
              ) : (
                <OrdersTable rows={orders} basePath="/admin/orders" />
              )}
            </CardContent>
          </Card>
        </div>
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
      {children}
    </div>
  );
}
