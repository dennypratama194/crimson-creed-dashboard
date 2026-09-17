import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";

import {
  DISTRIBUTION_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type DistributionStatus,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/constants/enums";
import { listAdminOrders } from "@/lib/db/orders";
import { clampPage } from "@/lib/db/paging";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { AdminOrdersFilterBar } from "@/app/(app)/admin/orders/admin-orders-filter-bar";
import { AdminOrdersTable } from "@/app/(app)/admin/orders/admin-orders-table";

export const metadata: Metadata = { title: "Orders" };

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
function pick<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return raw && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

export default async function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const page = clampPage(one(sp.page));
  const search = one(sp.q) ?? "";
  const status = pick<OrderStatus>(one(sp.status), ORDER_STATUSES);
  const paymentStatus = pick<PaymentStatus>(one(sp.payment), PAYMENT_STATUSES);
  const distributionStatus = pick<DistributionStatus>(
    one(sp.distribution),
    DISTRIBUTION_STATUSES,
  );

  const { rows, total, pageSize } = await listAdminOrders({
    page,
    search,
    status,
    paymentStatus,
    distributionStatus,
  });

  const isFiltered =
    search !== "" || !!status || !!paymentStatus || !!distributionStatus;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order, with its payment and distribution workflow."
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
        <AdminOrdersFilterBar />

        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={isFiltered ? "No orders match" : "No orders yet"}
            description={
              isFiltered
                ? "Try clearing a filter."
                : "Orders placed by members show up here."
            }
          />
        ) : (
          <>
            <AdminOrdersTable rows={rows} />
            <Pagination page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </>
  );
}
