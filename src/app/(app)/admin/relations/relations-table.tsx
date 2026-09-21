import Link from "next/link";

import type { RelationListRow } from "@/lib/db/relations";
import { formatDate } from "@/lib/format";
import { LinkedTableRow } from "@/components/patterns/linked-table-row";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function RelationsTable({ rows }: { rows: RelationListRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Person in charge</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead>Metal scrap</TableHead>
          <TableHead>Oath date</TableHead>
          <TableHead>Blood oath</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((relation) => (
          <LinkedTableRow
            key={relation.id}
            href={`/admin/relations/${relation.id}/edit`}
          >
            <TableCell>
              <Link
                href={`/admin/relations/${relation.id}/edit`}
                prefetch={false}
                className="font-medium hover:underline"
              >
                {relation.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {relation.handler_name ?? (
                <span className="text-muted-foreground/60">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {formatDate(relation.joined_on)}
            </TableCell>
            <TableCell>
              <Badge
                tone={relation.metal_scrap_settled ? "success" : "warning"}
              >
                {relation.metal_scrap_settled ? "Settled" : "Pending"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {relation.oath_date ? (
                formatDate(relation.oath_date)
              ) : (
                <span className="text-muted-foreground/60">—</span>
              )}
            </TableCell>
            <TableCell>
              {relation.blood_oath ? (
                <Badge tone="brand">Yes</Badge>
              ) : (
                <span className="text-muted-foreground/60">—</span>
              )}
            </TableCell>
            <TableCell className="max-w-xs">
              {relation.notes ? (
                <span className="line-clamp-1 text-muted-foreground">
                  {relation.notes}
                </span>
              ) : (
                <span className="text-muted-foreground/60">—</span>
              )}
            </TableCell>
          </LinkedTableRow>
        ))}
      </TableBody>
    </Table>
  );
}
