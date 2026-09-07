import Link from "next/link";

import type { Relation } from "@/lib/db/relations";
import { formatDate } from "@/lib/format";
import { LinkedTableRow } from "@/components/patterns/linked-table-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function RelationsTable({ rows }: { rows: Relation[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Joined</TableHead>
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
                className="font-medium hover:underline"
              >
                {relation.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {formatDate(relation.joined_on)}
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
