import type { Metadata, Route } from "next";
import Link from "next/link";
import { Lock, PackageX } from "lucide-react";

import { isSuperAdmin, requireActiveMember } from "@/lib/auth/session";
import { getOrderableItems } from "@/lib/db/orders";
import { getMySubmissionDebt } from "@/lib/db/submissions";
import { formatMonth } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { OrderBuilder } from "@/app/(app)/orders/new/order-builder";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage() {
  const member = await requireActiveMember();
  const [items, debtMonths] = await Promise.all([
    getOrderableItems(),
    getMySubmissionDebt(),
  ]);
  const listPath: Route = isSuperAdmin(member) ? "/admin/orders" : "/orders";

  return (
    <>
      <PageHeader
        title="New order"
        description="Add items and quantities, then place the order for review."
      />
      {debtMonths.length > 0 ? (
        <EmptyState
          icon={Lock}
          title="Hand in your monthly materials first"
          description={`Ordering is locked until your material submission is confirmed for ${debtMonths
            .map((m) => formatMonth(m))
            .join(", ")}.`}
          action={
            <Button asChild>
              <Link href="/submissions">Go to monthly submissions</Link>
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title="Nothing to order"
          description="There are no orderable items in the catalogue right now."
          action={
            <Button asChild variant="secondary">
              <Link href={listPath}>Back to orders</Link>
            </Button>
          }
        />
      ) : (
        <OrderBuilder items={items} listPath={listPath} />
      )}
    </>
  );
}
