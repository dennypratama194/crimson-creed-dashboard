"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";

import type { InventoryLine } from "@/lib/db/inventory";
import { formatQuantity } from "@/lib/format";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  archiveItemAction,
  restoreItemAction,
} from "@/app/(app)/admin/items/actions";
import { DeleteItemDialog } from "@/app/(app)/admin/inventory/delete-item-dialog";
import { StockDialog } from "@/app/(app)/admin/inventory/stock-dialog";

/**
 * Two ways to remove an item, because they are not interchangeable:
 *
 *   Archive — always available and reversible. The row stays, so every record
 *             pointing at it keeps resolving.
 *   Delete  — gone for good, taking its stash history with it. Refused while
 *             the item sits on an order or a draw (money, not stock history);
 *             the RPC names which.
 */
export function InventoryRowActions({ line }: { line: InventoryLine }) {
  const archived = line.archived_at !== null;

  // Permanent delete has its own dialog: it names what is destroyed, spells out
  // the blockers up front, and asks for the item name to be typed. Archive is
  // the reversible neighbour and keeps the plain confirm.
  const deleteAction = (
    <DeleteItemDialog
      itemId={line.id}
      itemName={line.name}
      trigger={
        <Button variant="ghost" size="sm" className="text-tone-error-fg">
          <Trash2 aria-hidden />
          Delete
        </Button>
      }
    />
  );

  return (
    <div className="flex items-center justify-end gap-1">
      {archived ? (
        <>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm">
                <ArchiveRestore aria-hidden />
                Restore
              </Button>
            }
            title={`Restore "${line.name}"?`}
            description="It returns to the stash with the stock it had when archived."
            confirmLabel="Restore"
            successMessage={`"${line.name}" restored.`}
            onConfirm={() => restoreItemAction(line.id)}
          />
          {deleteAction}
        </>
      ) : (
        <>
          <StockDialog
            itemId={line.id}
            itemName={line.name}
            currentQuantity={line.current_quantity}
            trigger={
              <Button variant="ghost" size="sm">
                Adjust
              </Button>
            }
          />
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm">
                <Archive aria-hidden />
                Archive
              </Button>
            }
            title={`Archive "${line.name}"?`}
            description={
              line.current_quantity > 0
                ? `It leaves the stash list and cannot be ordered, drawn or produced. It still holds ${formatQuantity(line.current_quantity)} in stock, and past movements keep their history. You can restore it later.`
                : "It leaves the stash list and cannot be ordered, drawn or produced. Past movements keep their history. You can restore it later."
            }
            confirmLabel="Archive"
            successMessage={`"${line.name}" archived.`}
            onConfirm={() => archiveItemAction(line.id)}
          />
          {deleteAction}
        </>
      )}
    </div>
  );
}
