import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Coins, Plus } from "lucide-react";

import { requireSuperAdmin } from "@/lib/auth/session";
import {
  listDistributionRates,
  listPriceableItems,
} from "@/lib/db/distribution";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { AddCutDialog } from "@/app/(app)/admin/distribution/rates/add-cut-dialog";
import { RatesTable } from "@/app/(app)/admin/distribution/rates/rates-table";

export const metadata: Metadata = { title: "Company cut" };

export default async function DistributionRatesPage() {
  await requireSuperAdmin();
  const [rows, priceable] = await Promise.all([
    listDistributionRates(),
    listPriceableItems(),
  ]);

  // Nothing left to price — every Product item already carries a cut, or none
  // exist yet. Either way the next step is creating one in Company stash.
  const canAdd = priceable.length > 0;
  const addTrigger = (
    <Button disabled={!canAdd}>
      <Plus aria-hidden />
      Add item
    </Button>
  );

  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/distribution">
            <ArrowLeft aria-hidden />
            Distribution
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Company cut"
        description="What a member owes the company per unit drawn. Only Product-category items can be priced — create them in Company stash first."
        actions={
          canAdd ? (
            <AddCutDialog items={priceable} trigger={addTrigger} />
          ) : (
            addTrigger
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="Nothing is drawable yet"
          description={
            canAdd
              ? "Pick a product and set what a member owes the company per unit. Only priced items show up here."
              : "No Product-category items are left to price. Add one under Company stash first."
          }
        />
      ) : (
        <RatesTable rows={rows} />
      )}
    </>
  );
}
