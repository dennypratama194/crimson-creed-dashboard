"use client";

import { useRouter } from "next/navigation";

import { ActionDialog } from "@/components/patterns/action-dialog";
import { Button } from "@/components/ui/button";
import { reverseCashEntryAction } from "@/app/(app)/admin/cash/actions";

export function ReverseEntryButton({
  entryId,
  entryNumber,
}: {
  entryId: string;
  entryNumber: string;
}) {
  const router = useRouter();

  return (
    <ActionDialog
      trigger={<Button variant="secondary">Reverse entry</Button>}
      title={`Reverse ${entryNumber}?`}
      description="Posts an opposite entry for the same amount and category. The original stays on the ledger for the record."
      confirmLabel="Reverse entry"
      destructive
      field={{
        label: "Reason",
        placeholder: "Why is this being reversed?",
        required: true,
      }}
      successMessage="Entry reversed."
      onConfirm={async (reason) => {
        const result = await reverseCashEntryAction({ entryId, reason });
        if (result.ok) router.refresh();
        return result;
      }}
    />
  );
}
