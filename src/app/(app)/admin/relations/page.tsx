import type { Metadata } from "next";
import Link from "next/link";
import { Handshake, Plus } from "lucide-react";

import { listRelations } from "@/lib/db/relations";
import {
  RELATION_LIST_SORTS,
  type RelationListSort,
} from "@/lib/validation/relation";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { RelationsFilterBar } from "@/app/(app)/admin/relations/relations-filter-bar";
import { RelationsTable } from "@/app/(app)/admin/relations/relations-table";

export const metadata: Metadata = { title: "Relations" };

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminRelationsPage({
  searchParams,
}: PageProps<"/admin/relations">) {
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.q) ?? "";

  const rawSort = one(sp.sort);
  const sort: RelationListSort = (
    RELATION_LIST_SORTS as readonly string[]
  ).includes(rawSort ?? "")
    ? (rawSort as RelationListSort)
    : "recent";

  const { rows, total, pageSize } = await listRelations({ page, search, sort });
  const isFiltered = search !== "";

  return (
    <>
      <PageHeader
        title="Relations"
        description="People and crews connected to the organisation, outside the member roster. Members never see this."
        actions={
          <Button asChild>
            <Link href="/admin/relations/new">
              <Plus aria-hidden />
              Add new relation
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <RelationsFilterBar />

        {rows.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title={isFiltered ? "No relations match" : "No relations yet"}
            description={
              isFiltered
                ? "Try a different search."
                : "Add the first person or crew connected to the organisation."
            }
            action={
              !isFiltered ? (
                <Button asChild variant="secondary">
                  <Link href="/admin/relations/new">
                    <Plus aria-hidden />
                    Add new relation
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <RelationsTable rows={rows} />
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
