import { describe, expect, it } from "vitest";

import {
  canTransitionOrderStatus,
  memberCanCancel,
  ORDER_STATUS_TONE,
} from "@/lib/constants/status-config";
import { ORDER_STATUSES } from "@/lib/constants/enums";

describe("order status transitions", () => {
  it("allows PENDING -> PROCESSING", () => {
    expect(canTransitionOrderStatus("PENDING", "PROCESSING")).toBe(true);
  });

  it("forbids arbitrary recovery transitions (PRD §25)", () => {
    expect(canTransitionOrderStatus("COMPLETED", "PENDING")).toBe(false);
    expect(canTransitionOrderStatus("CANCELLED", "PROCESSING")).toBe(false);
  });

  it("only lets members cancel PENDING orders", () => {
    expect(memberCanCancel("PENDING")).toBe(true);
    expect(memberCanCancel("PROCESSING")).toBe(false);
  });

  it("has a tone for every order status", () => {
    for (const status of ORDER_STATUSES) {
      expect(ORDER_STATUS_TONE[status]).toBeTypeOf("string");
    }
  });
});
