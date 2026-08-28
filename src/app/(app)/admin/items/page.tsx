import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus } from "lucide-react";

import type { ItemCategory } from "@/lib/constants/enums";
import { ITEM_CATEGORIES } from "@/lib/constants/enums";
import { listItems } from "@/lib/db/items";
import {
  ITEM_LIST_SORTS,
  ITEM_LIST_STATUSES,
  type ItemListSort,
  type ItemListStatus,
} from "@/lib/validation/item";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { ItemsFilterBar } from "@/app/(app)/admin/items/items-filter-bar";
import { ItemsTable } from "@/app/(app)/admin/items/items-table";

export const metadata: Metadata = { title: "Items" };

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminItemsPage({
  searchParams,
}: PageProps<"/admin/items">) {
  const sp = await searchParams;

  const page = Math.max(1, Number(one(sp.page)) || 1);
  const search = one(sp.q) ?? "";

  const rawCategory = one(sp.category);
  const category: ItemCategory | "all" =
    rawCategory && (ITEM_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as ItemCategory)
      : "all";

  const rawStatus = one(sp.status);
  const status: ItemListStatus = (
    ITEM_LIST_STATUSES as readonly string[]
  ).includes(rawStatus ?? "")
    ? (rawStatus as ItemListStatus)
    : "all";

  const rawSort = one(sp.sort);
  const sort: ItemListSort = (ITEM_LIST_SORTS as readonly string[]).includes(
    rawSort ?? "",
  )
    ? (rawSort as ItemListSort)
    : "name";

  const { rows, total, pageSize } = await listItems({
    page,
    search,
    category,
    status,
    sort,
  });

  const isFiltered = search !== "" || category !== "all" || status !== "all";

  return (
    <>
      <PageHeader
        title="Item catalogue"
        description="Categories, prices, and what members can order."
        actions={
          <Button asChild>
            <Link href="/admin/items/new">
              <Plus aria-hidden />
              New item
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <ItemsFilterBar />

        {rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title={isFiltered ? "No items match" : "No items yet"}
            description={
              isFiltered
                ? "Try a different search or filter."
                : "Add your first item to the catalogue."
            }
            action={
              !isFiltered ? (
                <Button asChild variant="secondary">
                  <Link href="/admin/items/new">
                    <Plus aria-hidden />
                    New item
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <ItemsTable rows={rows} />
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
