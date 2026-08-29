import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";

import { APP_ROLES, type AppRole } from "@/lib/constants/enums";
import {
  APP_ROLE_LABEL,
  MEMBER_RANK_LABEL,
  MEMBER_STATUS_LABEL,
} from "@/lib/constants/labels";
import { listMembers } from "@/lib/db/members";
import {
  MEMBER_LIST_STATUSES,
  type MemberListStatus,
} from "@/lib/validation/member";
import { EmptyState } from "@/components/patterns/empty-state";
import { LinkedTableRow } from "@/components/patterns/linked-table-row";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MembersFilterBar } from "@/app/(app)/admin/members/members-filter-bar";
import { MembersRowActions } from "@/app/(app)/admin/members/members-row-actions";

export const metadata: Metadata = { title: "Members" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminMembersPage({
  searchParams,
}: PageProps<"/admin/members">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.q) ?? "";
  const rawStatus = one(sp.status);
  const status: MemberListStatus = (
    MEMBER_LIST_STATUSES as readonly string[]
  ).includes(rawStatus ?? "")
    ? (rawStatus as MemberListStatus)
    : "all";
  const rawRole = one(sp.role);
  const role = (APP_ROLES as readonly string[]).includes(rawRole ?? "")
    ? (rawRole as AppRole)
    : undefined;

  const { rows, total, pageSize } = await listMembers({
    page,
    search,
    status,
    role,
  });

  const isFiltered = search !== "" || status !== "all" || !!role;

  return (
    <>
      <PageHeader
        title="Members"
        description="Accounts, ranks, and access."
        actions={
          <Button asChild>
            <Link href="/admin/members/new">
              <Plus aria-hidden />
              New member
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <MembersFilterBar />

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={isFiltered ? "No members match" : "No members yet"}
            description={
              isFiltered
                ? "Try clearing a filter."
                : "Create the first member account."
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span data-align="right" className="block">
                      Orders
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                  <TableHead className="w-8">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <LinkedTableRow key={m.id} href={`/admin/members/${m.id}`}>
                    <TableCell>
                      <Link
                        href={`/admin/members/${m.id}`}
                        className="font-medium hover:underline"
                      >
                        {m.display_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {MEMBER_RANK_LABEL[m.rank]}
                    </TableCell>
                    <TableCell>
                      <Badge tone={m.role === "SUPER_ADMIN" ? "brand" : "gray"}>
                        {APP_ROLE_LABEL[m.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={m.status === "ACTIVE" ? "success" : "gray"}>
                        {MEMBER_STATUS_LABEL[m.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.order_count}
                    </TableCell>
                    <TableCell className="text-right">
                      <MembersRowActions
                        memberId={m.id}
                        displayName={m.display_name}
                        status={m.status}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight
                        aria-hidden
                        className="inline size-4 text-muted-foreground"
                      />
                    </TableCell>
                  </LinkedTableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
