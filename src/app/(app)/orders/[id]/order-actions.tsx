"use client";

import { useRouter } from "next/navigation";

import type { OrderStatus, PaymentStatus } from "@/lib/constants/enums";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  cancelOrderAction,
  submitPaymentAction,
} from "@/app/(app)/orders/actions";

export function OrderActions({
  orderId,
  status,
  paymentStatus,
}: {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
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
        <ConfirmDialog
          trigger={<Button>I&apos;ve paid</Button>}
          title="Confirm the in-game payment"
          description="Only do this once you have actually sent the payment in-game. A Super Admin will verify it."
          confirmLabel="Yes, I've paid"
          successMessage="Payment reported — a Super Admin will verify it."
          onConfirm={async () => {
            const result = await submitPaymentAction(orderId);
            if (result.ok) router.refresh();
            return result;
          }}
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
