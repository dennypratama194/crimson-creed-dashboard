import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Plus, ShoppingCart } from "lucide-react";

import { listOrders } from "@/lib/db/orders";
import { ORDER_LIST_SCOPES, type OrderListScope } from "@/lib/validation/order";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clampPage } from "@/lib/db/paging";
import { OrdersTable } from "@/app/(app)/orders/orders-table";

export const metadata: Metadata = { title: "Orders" };

const SCOPE_LABEL: Record<OrderListScope, string> = {
  all: "All",
  open: "Open",
  closed: "Closed",
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OrdersPage({
  searchParams,
}: PageProps<"/orders">) {
  const sp = await searchParams;
  const page = clampPage(one(sp.page));
  const rawScope = one(sp.scope);
  const scope: OrderListScope = (
    ORDER_LIST_SCOPES as readonly string[]
  ).includes(rawScope ?? "")
    ? (rawScope as OrderListScope)
    : "all";

  const { rows, total, pageSize } = await listOrders({ page, scope });

  return (
    <>
      <PageHeader
        title="Orders"
        description="Your orders and where each one stands."
        actions={
          <Button asChild>
            <Link href="/orders/new">
              <Plus aria-hidden />
              New order
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label="Filter orders"
          className="inline-flex w-fit rounded-lg border border-border p-0.5 text-sm"
        >
          {ORDER_LIST_SCOPES.map((value) => {
            const active = value === scope;
            const href = (
              value === "all" ? "/orders" : `/orders?scope=${value}`
            ) as Route;
            return (
              <Link
                key={value}
                href={href}
                role="tab"
                aria-selected={active}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  active
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {SCOPE_LABEL[value]}
              </Link>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title={scope === "all" ? "No orders yet" : "Nothing here"}
            description={
              scope === "all"
                ? "Create an order to request items from the org."
                : "No orders match this filter."
            }
            action={
              scope === "all" ? (
                <Button asChild variant="secondary">
                  <Link href="/orders/new">
                    <Plus aria-hidden />
                    New order
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <OrdersTable rows={rows} />
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
