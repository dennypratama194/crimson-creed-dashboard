"use client";

import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import Link from "next/link";

import type { Supplier } from "@/lib/db/suppliers";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  archiveSupplierAction,
  restoreSupplierAction,
} from "@/app/(app)/admin/suppliers/actions";

export function SupplierRowActions({ supplier }: { supplier: Supplier }) {
  const archived = supplier.archived_at !== null;

  return (
    <div className="flex items-center justify-end gap-1">
      {!archived ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/admin/suppliers/${supplier.id}/edit`}>
            <Pencil aria-hidden />
            Edit
          </Link>
        </Button>
      ) : null}

      {archived ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              <ArchiveRestore aria-hidden />
              Restore
            </Button>
          }
          title={`Restore "${supplier.name}"?`}
          description="It becomes active again and shows in the catalogue."
          confirmLabel="Restore"
          successMessage={`"${supplier.name}" restored.`}
          onConfirm={() => restoreSupplierAction(supplier.id)}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              <Archive aria-hidden />
              Archive
            </Button>
          }
          title={`Archive "${supplier.name}"?`}
          description="It is hidden from the catalogue. Its price-book lines are kept and you can restore it later."
          confirmLabel="Archive"
          destructive
          successMessage={`"${supplier.name}" archived.`}
          onConfirm={() => archiveSupplierAction(supplier.id)}
        />
      )}
    </div>
  );
}
