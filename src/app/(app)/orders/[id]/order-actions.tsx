"use client";

import { useRouter } from "next/navigation";

import type { OrderStatus, PaymentStatus } from "@/lib/constants/enums";
import type { PaymentRecipient } from "@/lib/db/orders";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cancelOrderAction } from "@/app/(app)/orders/actions";
import { MarkPaidDialog } from "@/app/(app)/orders/[id]/mark-paid-dialog";

export function OrderActions({
  orderId,
  status,
  paymentStatus,
  recipients,
}: {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  recipients: PaymentRecipient[];
}) {
  const router = useRouter();

  const canCancel = status === "PENDING";
  const canSubmitPayment =
    (paymentStatus === "UNPAID" || paymentStatus === "PAYMENT_REJECTED") &&
    status !== "CANCELLED" &&
    status !== "REJECTED" &&
    status !== "COMPLETED";

  if (!canCancel && !canSubmitPayment) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSubmitPayment ? (
        <MarkPaidDialog
          orderId={orderId}
          recipients={recipients}
          trigger={<Button>I&apos;ve paid</Button>}
        />
      ) : null}

      {canCancel ? (
        <ConfirmDialog
          trigger={<Button variant="secondary">Cancel order</Button>}
          title="Cancel this order?"
          description="You can only cancel while it is still pending. This cannot be undone."
          confirmLabel="Cancel order"
          destructive
          successMessage="Order cancelled."
          onConfirm={async () => {
            const result = await cancelOrderAction(orderId);
            if (result.ok) router.refresh();
            return result;
          }}
        />
      ) : null}
    </div>
  );
}
