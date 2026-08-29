"use client";

import { useRouter } from "next/navigation";

import type { PayrollRunStatus } from "@/lib/constants/enums";
import { formatMoney } from "@/lib/format";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  finalizePayrollRunAction,
  markPayrollRunPaidAction,
} from "@/app/(app)/admin/payroll/actions";

export function PayrollRunActions({
  runId,
  status,
  total,
}: {
  runId: string;
  status: PayrollRunStatus;
  total: number;
}) {
  const router = useRouter();

  if (status === "DRAFT") {
    return (
      <ConfirmDialog
        trigger={<Button>Finalize run</Button>}
        title="Finalize this payroll run?"
        description="Approved production logs in the period are locked into each member's line and can no longer be re-reviewed. Members are notified."
        confirmLabel="Finalize"
        successMessage="Payroll run finalized."
        onConfirm={async () => {
          const result = await finalizePayrollRunAction(runId);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    );
  }

  if (status === "FINALIZED") {
    return (
      <ConfirmDialog
        trigger={<Button>Mark paid</Button>}
        title="Mark this run paid?"
        description={`Confirm the ${formatMoney(total)} total has been paid out in-game. Members are notified.`}
        confirmLabel="Mark paid"
        successMessage="Payroll run marked paid."
        onConfirm={async () => {
          const result = await markPayrollRunPaidAction(runId);
          if (result.ok) router.refresh();
          return result;
        }}
      />
    );
  }

  return null;
}
