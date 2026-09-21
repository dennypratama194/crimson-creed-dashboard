import type { OrderStatus, PaymentStatus } from "@/lib/constants/enums";

/**
 * Whether the "I've paid" control shows for this order. The order page uses it
 * to skip loading the recipient list when the control will not render. It only
 * gates the UI: `submit_order_payment` stays the authority.
 */
export function canSubmitOrderPayment(
  status: OrderStatus,
  paymentStatus: PaymentStatus,
): boolean {
  return (
    (paymentStatus === "UNPAID" || paymentStatus === "PAYMENT_REJECTED") &&
    status !== "CANCELLED" &&
    status !== "REJECTED" &&
    status !== "COMPLETED"
  );
}
