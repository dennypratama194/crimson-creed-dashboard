import type { Metadata } from "next";
import { FlaskConical, Plus } from "lucide-react";

import { listProductionRates } from "@/lib/db/production";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { NewProductDialog } from "@/app/(app)/admin/production/rates/new-product-dialog";
import { RatesTable } from "@/app/(app)/admin/production/rates/rates-table";

export const metadata: Metadata = { title: "Production pay rates" };

export default async function ProductionRatesPage() {
  const rows = await listProductionRates();
  const missing = rows.filter((r) => r.unit_rate === null).length;

  return (
    <>
      <PageHeader
        title="Production pay rates"
        description="Piece-rate pay per product. Members can only log products that have a rate."
        actions={
          <NewProductDialog
            trigger={
              <Button>
                <Plus aria-hidden />
                New product
              </Button>
            }
          />
        }
      />

      <div className="flex flex-col gap-4">
        {missing > 0 ? (
          <p className="rounded-md border border-tone-warning-border bg-tone-warning-bg px-3 py-2 text-sm text-tone-warning-fg">
            {missing} product{missing === 1 ? "" : "s"} without a pay rate —
            members cannot log those yet.
          </p>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No products yet"
            description="Add a product to pay members for processing it. Existing PRODUCT items in the catalogue show up here automatically."
            action={
              <NewProductDialog
                trigger={
                  <Button variant="secondary">
                    <Plus aria-hidden />
                    New product
                  </Button>
                }
              />
            }
          />
        ) : (
          <RatesTable rows={rows} />
        )}
      </div>
    </>
  );
}
