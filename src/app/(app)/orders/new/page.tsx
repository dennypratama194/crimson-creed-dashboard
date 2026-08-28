import type { Metadata } from "next";
import Link from "next/link";
import { PackageX } from "lucide-react";

import { requireActiveMember } from "@/lib/auth/session";
import { getOrderableItems } from "@/lib/db/orders";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { OrderBuilder } from "@/app/(app)/orders/new/order-builder";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage() {
  await requireActiveMember();
  const items = await getOrderableItems();

  return (
    <>
      <PageHeader
        title="New order"
        description="Add items and quantities, then place the order for review."
      />
      {items.length === 0 ? (
        <EmptyState
          icon={PackageX}
          title="Nothing to order"
          description="There are no orderable items in the catalogue right now."
          action={
            <Button asChild variant="secondary">
              <Link href="/orders">Back to orders</Link>
            </Button>
          }
        />
      ) : (
        <OrderBuilder items={items} />
      )}
    </>
  );
}
