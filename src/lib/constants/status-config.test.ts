import { describe, expect, it } from "vitest";

import {
  canTransitionOrderStatus,
  CASH_DIRECTION_TONE,
  DISTRIBUTION_STATUS_TONE,
  DRAW_STATUS_TONE,
  PRODUCTION_ASSIGNMENT_STATUS_TONE,
  DISTRIBUTION_STATUS_TRANSITIONS,
  MEMBER_SUBMISSION_STATUS_TONE,
  memberCanCancel,
  ORDER_STATUS_TONE,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_STATUS_TONE,
  PAYMENT_STATUS_TRANSITIONS,
  PAYROLL_RUN_STATUS_TONE,
  PRODUCTION_LOG_STATUS_TONE,
} from "@/lib/constants/status-config";
import {
  CASH_DIRECTIONS,
  DISTRIBUTION_STATUSES,
  DRAW_STATUSES,
  PRODUCTION_ASSIGNMENT_STATUSES,
  MEMBER_SUBMISSION_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PAYROLL_RUN_STATUSES,
  PRODUCTION_LOG_STATUSES,
} from "@/lib/constants/enums";

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

  it("treats every closed status as terminal", () => {
    for (const status of ["COMPLETED", "CANCELLED", "REJECTED"] as const) {
      expect(ORDER_STATUS_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("can never move an order back to PENDING", () => {
    for (const from of ORDER_STATUSES) {
      expect(canTransitionOrderStatus(from, "PENDING")).toBe(false);
    }
  });

  it("only transitions between known statuses", () => {
    for (const targets of Object.values(ORDER_STATUS_TRANSITIONS)) {
      for (const to of targets) expect(ORDER_STATUSES).toContain(to);
    }
  });
});

describe("payment status transitions", () => {
  it("follows UNPAID -> PAYMENT_SUBMITTED -> PAID", () => {
    expect(PAYMENT_STATUS_TRANSITIONS.UNPAID).toEqual(["PAYMENT_SUBMITTED"]);
    expect(PAYMENT_STATUS_TRANSITIONS.PAYMENT_SUBMITTED).toContain("PAID");
  });

  it("lets a rejected payment be resubmitted, but never un-pays", () => {
    expect(PAYMENT_STATUS_TRANSITIONS.PAYMENT_REJECTED).toEqual([
      "PAYMENT_SUBMITTED",
    ]);
    expect(PAYMENT_STATUS_TRANSITIONS.PAID).toEqual([]);
  });

  it("covers every payment status", () => {
    expect(Object.keys(PAYMENT_STATUS_TRANSITIONS).sort()).toEqual(
      [...PAYMENT_STATUSES].sort(),
    );
  });
});

describe("distribution status transitions", () => {
  it("is one-way", () => {
    expect(DISTRIBUTION_STATUS_TRANSITIONS.NOT_DISTRIBUTED).toEqual([
      "DISTRIBUTED",
    ]);
    expect(DISTRIBUTION_STATUS_TRANSITIONS.DISTRIBUTED).toEqual([]);
  });
});

describe("status tones", () => {
  it("has a tone for every value of every status enum", () => {
    const cases: [readonly string[], Record<string, string>][] = [
      [PAYMENT_STATUSES, PAYMENT_STATUS_TONE],
      [DISTRIBUTION_STATUSES, DISTRIBUTION_STATUS_TONE],
      [DRAW_STATUSES, DRAW_STATUS_TONE],
      [PRODUCTION_ASSIGNMENT_STATUSES, PRODUCTION_ASSIGNMENT_STATUS_TONE],
      [PRODUCTION_LOG_STATUSES, PRODUCTION_LOG_STATUS_TONE],
      [PAYROLL_RUN_STATUSES, PAYROLL_RUN_STATUS_TONE],
      [MEMBER_SUBMISSION_STATUSES, MEMBER_SUBMISSION_STATUS_TONE],
      [CASH_DIRECTIONS, CASH_DIRECTION_TONE],
    ];
    for (const [values, tones] of cases) {
      for (const value of values) expect(tones[value]).toBeTypeOf("string");
    }
  });
});
