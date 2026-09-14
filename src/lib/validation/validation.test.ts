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
import {
  createPayrollRunSchema,
  reviewProductionLogSchema,
  submitProductionLogSchema,
} from "@/lib/validation/production";
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

describe("production + payroll schemas", () => {
  it("never accepts a payout or rate from the browser", () => {
    const parsed = submitProductionLogSchema.parse({
      itemId: ID,
      quantity: 4,
      payout: 1_000_000,
      unitRate: 999,
    });
    expect(parsed).toEqual({ itemId: ID, quantity: 4 });
  });

  it("requires a reason to reject a production log", () => {
    expect(
      firstError(
        reviewProductionLogSchema.safeParse({ logId: ID, approve: false }),
      ),
    ).toBe("A reason is required to reject");
    expect(
      reviewProductionLogSchema.safeParse({ logId: ID, approve: true }).success,
    ).toBe(true);
  });

  it("requires a payroll period that does not end before it starts", () => {
    expect(
      firstError(
        createPayrollRunSchema.safeParse({
          periodStart: "2026-09-10",
          periodEnd: "2026-09-01",
        }),
      ),
    ).toBe("The end date must be on or after the start date");
    expect(
      createPayrollRunSchema.safeParse({
        periodStart: "2026-09-01",
        periodEnd: "2026-09-01",
      }).success,
    ).toBe(true);
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
