"use client";

import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import Link from "next/link";

import type { Item } from "@/lib/db/items";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  archiveItemAction,
  restoreItemAction,
} from "@/app/(app)/admin/items/actions";

export function ItemRowActions({ item }: { item: Item }) {
  const archived = item.archived_at !== null;

  return (
    <div className="flex items-center justify-end gap-1">
      {!archived ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/admin/items/${item.id}/edit`}>
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
          title={`Restore "${item.name}"?`}
          description="It becomes active again and members can see it."
          confirmLabel="Restore"
          successMessage={`"${item.name}" restored.`}
          onConfirm={() => restoreItemAction(item.id)}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              <Archive aria-hidden />
              Archive
            </Button>
          }
          title={`Archive "${item.name}"?`}
          description="It is hidden from the catalogue and cannot be ordered. Past orders keep their snapshots. You can restore it later."
          confirmLabel="Archive"
          destructive
          successMessage={`"${item.name}" archived.`}
          onConfirm={() => archiveItemAction(item.id)}
        />
      )}
    </div>
  );
}
