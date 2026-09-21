import type { Metadata } from "next";
import { ScrollText } from "lucide-react";

import { AUDIT_ACTIONS, type AuditAction } from "@/lib/constants/enums";
import { listAudit } from "@/lib/db/activity";
import { formatDateTime, humanizeToken } from "@/lib/format";
import { clampPage } from "@/lib/db/paging";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AuditDetailDialog } from "@/app/(app)/admin/audit/audit-detail-dialog";
import { AuditFilter } from "@/app/(app)/admin/audit/audit-filter";

export const metadata: Metadata = { title: "Audit log" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminAuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  const sp = await searchParams;
  const page = clampPage(one(sp.page));
  const rawAction = one(sp.action);
  const action = (AUDIT_ACTIONS as readonly string[]).includes(rawAction ?? "")
    ? (rawAction as AuditAction)
    : undefined;

  const { rows, total, pageSize } = await listAudit({ page, action });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only record of sensitive actions, kept for one year."
      />

      <div className="flex flex-col gap-4">
        <AuditFilter />

        {rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={action ? "No entries for this action" : "No audit entries"}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>
                    <span className="sr-only">Detail</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.actor_name ?? "System"}
                    </TableCell>
                    <TableCell>{humanizeToken(entry.action)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.entity_type}
                      {entry.entity_id ? (
                        <span className="font-mono text-xs">
                          {" "}
                          {entry.entity_id.slice(0, 8)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <AuditDetailDialog
                        action={humanizeToken(entry.action)}
                        oldValues={entry.old_values}
                        newValues={entry.new_values}
                      />
                    </TableCell>
                  </TableRow>
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
