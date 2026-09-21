"use client";

import type { MemberStatus } from "@/lib/constants/enums";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Button } from "@/components/ui/button";
import { setMemberStatusAction } from "@/app/(app)/admin/members/actions";

export function MemberStatusButton({
  memberId,
  currentStatus,
}: {
  memberId: string;
  currentStatus: MemberStatus;
}) {
  const next: MemberStatus = currentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const deactivating = next === "INACTIVE";

  return (
    <ConfirmDialog
      trigger={
        <Button variant={deactivating ? "destructive" : "primary"}>
          {deactivating ? "Deactivate" : "Reactivate"}
        </Button>
      }
      title={
        deactivating ? "Deactivate this member?" : "Reactivate this member?"
      }
      description={
        deactivating
          ? "They will not be able to sign in until reactivated. Their orders and history stay intact."
          : "They will be able to sign in again."
      }
      confirmLabel={deactivating ? "Deactivate" : "Reactivate"}
      destructive={deactivating}
      successMessage={
        deactivating ? "Member deactivated." : "Member reactivated."
      }
      onConfirm={async () => {
        const result = await setMemberStatusAction(memberId, next);
        return result;
      }}
    />
  );
}
