import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getItem } from "@/lib/db/items";
import { getItemSuppliers } from "@/lib/db/suppliers";
import { formatMoney, formatQuantity } from "@/lib/format";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ItemForm } from "@/app/(app)/admin/items/item-form";

export const metadata: Metadata = { title: "Edit item" };

export default async function EditItemPage({
  params,
}: PageProps<"/admin/items/[id]/edit">) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const suppliers = await getItemSuppliers(item.id);
  const isCatalogue = item.stock_type === "CATALOGUE";
  const returnTo = isCatalogue ? "/admin/items" : "/admin/inventory";

  return (
    <>
      <div className="pb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={returnTo}>
            <ArrowLeft aria-hidden />
            {isCatalogue ? "Items" : "Company stash"}
          </Link>
        </Button>
      </div>

      <PageHeader
        title={item.name}
        description={
          isCatalogue
            ? "Editing does not change any past orders — their prices and names are snapshots."
            : "A company-stash item — not shown to members or the order page."
        }
      />
      <ItemForm item={item} returnTo={returnTo} />

      {suppliers.length > 0 ? (
        <section className="mt-8 flex max-w-2xl flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Sourced from
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>
                  <span data-align="right" className="block">
                    Buy
                  </span>
                </TableHead>
                <TableHead>
                  <span data-align="right" className="block">
                    Sell
                  </span>
                </TableHead>
                <TableHead>
                  <span data-align="right" className="block">
                    Max / order
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Link
                      href={`/admin/suppliers/${line.supplier.id}`}
                      className="font-medium hover:underline"
                    >
                      {line.supplier.name}
                    </Link>
                    {line.supplier.archived_at ? (
                      <Badge tone="gray" className="ml-2">
                        Archived
                      </Badge>
                    ) : null}
                    {!line.active ? (
                      <Badge tone="warning" className="ml-2">
                        Disabled
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(line.buy_price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.sell_price === null
                      ? "—"
                      : formatMoney(line.sell_price)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {line.max_quantity === null
                      ? "—"
                      : formatQuantity(line.max_quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            The member-facing price is set above, not here. These are what each
            supplier quotes.
          </p>
        </section>
      ) : null}
    </>
  );
}
