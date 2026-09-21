import { describe, expect, it } from "vitest";

import { canSubmitOrderPayment } from "@/lib/order-payment";

describe("canSubmitOrderPayment", () => {
  it("is open while the order is live and unpaid or rejected", () => {
    for (const status of ["PENDING", "PROCESSING"] as const) {
      expect(canSubmitOrderPayment(status, "UNPAID")).toBe(true);
      expect(canSubmitOrderPayment(status, "PAYMENT_REJECTED")).toBe(true);
    }
  });

  it("is closed once a payment is submitted or verified", () => {
    expect(canSubmitOrderPayment("PENDING", "PAYMENT_SUBMITTED")).toBe(false);
    expect(canSubmitOrderPayment("PROCESSING", "PAID")).toBe(false);
  });

  it("is closed for every finished order, whatever its payment state", () => {
    for (const status of ["COMPLETED", "CANCELLED", "REJECTED"] as const) {
      expect(canSubmitOrderPayment(status, "UNPAID")).toBe(false);
      expect(canSubmitOrderPayment(status, "PAYMENT_REJECTED")).toBe(false);
    }
  });
});
