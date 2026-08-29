"use client";

import { useRouter } from "next/navigation";

import type {
  DistributionStatus,
  OrderStatus,
  PaymentStatus,
} from "@/lib/constants/enums";
import { ActionDialog } from "@/components/patterns/action-dialog";
import { Button } from "@/components/ui/button";
import {
  adminCancelOrderAction,
  adminRejectOrderAction,
  completeOrderAction,
  recordDistributionAction,
  rejectPaymentAction,
  startProcessingAction,
  verifyPaymentAction,
} from "@/app/(app)/admin/orders/actions";

export function AdminOrderActions({
  orderId,
  status,
  paymentStatus,
  distributionStatus,
}: {
  orderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  distributionStatus: DistributionStatus;
}) {
  const router = useRouter();
  const after = (r: { ok: boolean; error?: string }) => {
    if (r.ok) router.refresh();
    return r;
  };

  const isOpen = status === "PENDING" || status === "PROCESSING";
  const canProcess = status === "PENDING";
  const canVerifyPayment = paymentStatus === "PAYMENT_SUBMITTED";
  const canDistribute =
    status === "PROCESSING" &&
    paymentStatus === "PAID" &&
    distributionStatus === "NOT_DISTRIBUTED";
  const canComplete =
    status === "PROCESSING" &&
    paymentStatus === "PAID" &&
    distributionStatus === "DISTRIBUTED";

  if (!isOpen && !canVerifyPayment && !canDistribute && !canComplete) {
    return (
      <p className="text-sm text-muted-foreground">
        No actions available for this order.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canProcess ? (
        <ActionDialog
          trigger={<Button>Start processing</Button>}
          title="Start processing this order?"
          warning="Once processing starts, the member can no longer cancel this order."
          confirmLabel="Start processing"
          successMessage="Order moved to processing."
          onConfirm={async () => after(await startProcessingAction(orderId))}
        />
      ) : null}

      {canVerifyPayment ? (
        <ActionDialog
          trigger={<Button>Verify payment</Button>}
          title="Verify the in-game payment"
          description="Confirm you have received the fictional in-game payment for this order."
          confirmLabel="Mark as paid"
          successMessage="Payment verified."
          field={{
            label: "Confirmation note",
            placeholder: "e.g. Confirmed in-game",
          }}
          onConfirm={async (note) =>
            after(await verifyPaymentAction(orderId, note))
          }
        />
      ) : null}

      {canVerifyPayment ? (
        <ActionDialog
          trigger={<Button variant="destructive">Reject payment</Button>}
          title="Reject this payment"
          description="The member will be asked to submit payment again."
          confirmLabel="Reject payment"
          destructive
          successMessage="Payment rejected — the member has been notified."
          field={{
            label: "Reason",
            placeholder: "Why is the payment being rejected?",
            required: true,
          }}
          onConfirm={async (reason) =>
            after(await rejectPaymentAction(orderId, reason))
          }
        />
      ) : null}

      {canDistribute ? (
        <ActionDialog
          trigger={<Button>Record distribution</Button>}
          title="Record hand-over"
          description="Confirm the items have been physically handed over in-game. This draws the quantities out of official stock."
          confirmLabel="Mark distributed"
          successMessage="Distribution recorded and stock updated."
          field={{
            label: "Note",
            placeholder: "e.g. Handed over at the lock-up",
          }}
          onConfirm={async (note) =>
            after(await recordDistributionAction(orderId, note))
          }
        />
      ) : null}

      {canComplete ? (
        <ActionDialog
          trigger={<Button>Complete order</Button>}
          title="Complete this order?"
          description="Marks the order finished. It is paid and distributed."
          confirmLabel="Complete order"
          successMessage="Order completed."
          onConfirm={async () => after(await completeOrderAction(orderId))}
        />
      ) : null}

      {isOpen ? (
        <ActionDialog
          trigger={<Button variant="secondary">Cancel</Button>}
          title="Cancel this order?"
          confirmLabel="Cancel order"
          destructive
          successMessage="Order cancelled — the member has been notified."
          field={{
            label: "Reason",
            placeholder: "Optional note for the member",
          }}
          onConfirm={async (reason) =>
            after(await adminCancelOrderAction(orderId, reason))
          }
        />
      ) : null}

      {isOpen ? (
        <ActionDialog
          trigger={<Button variant="destructive">Reject</Button>}
          title="Reject this order?"
          description="Use this when the request should not be fulfilled at all."
          confirmLabel="Reject order"
          destructive
          successMessage="Order rejected — the member has been notified."
          field={{
            label: "Reason",
            placeholder: "Why is this order being rejected?",
            required: true,
          }}
          onConfirm={async (reason) =>
            after(await adminRejectOrderAction(orderId, reason))
          }
        />
      ) : null}
    </div>
  );
}
