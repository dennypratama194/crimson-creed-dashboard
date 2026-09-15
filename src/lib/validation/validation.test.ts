import { describe, expect, it } from "vitest";

import {
  CASH_CATEGORY_DIRECTION,
  cashCategoriesFor,
} from "@/lib/constants/cash";
import { CASH_CATEGORIES } from "@/lib/constants/enums";
import { recordCashEntrySchema } from "@/lib/validation/cash";
import {
  createOrderSchema,
  submitOrderPaymentSchema,
} from "@/lib/validation/order";
import { createProductionAssignmentSchema } from "@/lib/validation/production";
import {
  issueDistributionSchema,
  reverseDistributionSchema,
} from "@/lib/validation/distribution";
import {
  setSubmissionGateSchema,
  submitMaterialSubmissionSchema,
} from "@/lib/validation/submission";

const ID = "3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c";
const OTHER_ID = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

function firstError(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.success ? null : (result.error?.issues[0]?.message ?? null);
}

describe("createOrderSchema", () => {
  it("accepts a valid order and strips anything the server must own", () => {
    const parsed = createOrderSchema.parse({
      items: [{ item_id: ID, quantity: 3, price: 0.01, member_id: OTHER_ID }],
      note: "  rush  ",
      member_id: OTHER_ID,
      total: 1,
    });
    expect(parsed).toEqual({
      items: [{ item_id: ID, quantity: 3 }],
      note: "rush",
    });
  });

  it("rejects empty, fractional, non-positive and oversized orders", () => {
    expect(firstError(createOrderSchema.safeParse({ items: [] }))).toBe(
      "Add at least one item",
    );
    const line = (quantity: number) => ({
      items: [{ item_id: ID, quantity }],
    });
    expect(firstError(createOrderSchema.safeParse(line(0)))).toBe(
      "Must be greater than zero",
    );
    expect(firstError(createOrderSchema.safeParse(line(1.5)))).toBe(
      "Whole numbers only",
    );
    expect(
      createOrderSchema.safeParse({
        items: Array.from({ length: 51 }, () => ({ item_id: ID, quantity: 1 })),
      }).success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        items: [{ item_id: "not-a-uuid", quantity: 1 }],
      }).success,
    ).toBe(false);
  });

  it("requires a real payment recipient id", () => {
    expect(
      firstError(
        submitOrderPaymentSchema.safeParse({ orderId: ID, paidTo: "" }),
      ),
    ).toBe("Choose who you paid");
  });
});

describe("recordCashEntrySchema", () => {
  const base = {
    direction: "IN",
    amount: 250,
    category: "SALES_REVENUE",
    handledBy: ID,
  } as const;

  it("accepts a category that matches the direction", () => {
    expect(recordCashEntrySchema.safeParse(base).success).toBe(true);
    expect(
      recordCashEntrySchema.safeParse({
        ...base,
        direction: "OUT",
        category: "PAYROLL",
      }).success,
    ).toBe(true);
  });

  it("rejects a category from the other direction on the category field", () => {
    const r = recordCashEntrySchema.safeParse({
      ...base,
      direction: "OUT",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["category"]);
  });

  it("rejects non-positive amounts and malformed dates", () => {
    expect(
      recordCashEntrySchema.safeParse({ ...base, amount: 0 }).success,
    ).toBe(false);
    expect(
      recordCashEntrySchema.safeParse({ ...base, occurredAt: "14/09/2026" })
        .success,
    ).toBe(false);
  });

  it("maps every category to exactly one direction", () => {
    for (const category of CASH_CATEGORIES) {
      expect(["IN", "OUT"]).toContain(CASH_CATEGORY_DIRECTION[category]);
    }
    for (const direction of ["IN", "OUT"] as const) {
      for (const category of cashCategoriesFor(direction)) {
        expect(CASH_CATEGORY_DIRECTION[category]).toBe(direction);
      }
    }
  });
});

describe("distribution + production schemas", () => {
  it("never accepts a rate or an owed amount from the browser", () => {
    const parsed = issueDistributionSchema.parse({
      memberId: ID,
      itemId: ID,
      quantity: 1000,
      unitRate: 1,
      amountOwed: 0,
    });
    expect(parsed).toEqual({ memberId: ID, itemId: ID, quantity: 1000 });
  });

  it("requires a whole draw quantity — a draw moves integer stock", () => {
    expect(
      firstError(
        issueDistributionSchema.safeParse({
          memberId: ID,
          itemId: ID,
          quantity: 10.5,
        }),
      ),
    ).toBe("Use a whole number");
  });

  it("requires a reason to reverse a draw", () => {
    expect(
      firstError(
        reverseDistributionSchema.safeParse({ distributionId: ID, reason: "" }),
      ),
    ).toBe("A reason is required to reverse a draw");
    expect(
      reverseDistributionSchema.safeParse({
        distributionId: ID,
        reason: "Wrong quantity",
      }).success,
    ).toBe(true);
  });

  it("requires at least one person in charge on a production assignment", () => {
    expect(
      firstError(
        createProductionAssignmentSchema.safeParse({
          memberIds: [],
          itemId: ID,
          quantity: 5,
        }),
      ),
    ).toBe("Pick who is in charge");
  });

  it("takes a crew — one assignment per person", () => {
    const other = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    const parsed = createProductionAssignmentSchema.parse({
      memberIds: [ID, other],
      itemId: ID,
      quantity: 5,
    });
    expect(parsed.memberIds).toEqual([ID, other]);
  });
});

describe("submission schemas", () => {
  const line = { materialTypeId: ID, quantity: 10 };

  it("requires a PIC and whole, non-negative quantities", () => {
    expect(
      firstError(submitMaterialSubmissionSchema.safeParse({ lines: [line] })),
    ).toBe("Choose who received your submission");
    expect(
      submitMaterialSubmissionSchema.safeParse({
        lines: [{ ...line, quantity: -1 }],
        receivedBy: OTHER_ID,
      }).success,
    ).toBe(false);
    expect(
      submitMaterialSubmissionSchema.safeParse({
        lines: [{ ...line, quantity: 2.5 }],
        receivedBy: OTHER_ID,
      }).success,
    ).toBe(false);
  });

  it("only accepts YYYY-MM months", () => {
    const ok = { lines: [line], receivedBy: OTHER_ID };
    expect(
      submitMaterialSubmissionSchema.safeParse({
        ...ok,
        periodMonth: "2026-08",
      }).success,
    ).toBe(true);
    expect(
      submitMaterialSubmissionSchema.safeParse({
        ...ok,
        periodMonth: "2026-08-01",
      }).success,
    ).toBe(false);
    expect(
      setSubmissionGateSchema.safeParse({ enabled: true, startMonth: "Aug" })
        .success,
    ).toBe(false);
  });
});
