import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDayShort,
  formatMoney,
  formatMonth,
  formatPercent,
  formatQuantity,
  humanizeToken,
} from "@/lib/format";

describe("money + number formatters", () => {
  it("formats in-game money with at most two decimals", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.5");
    expect(formatMoney("2500")).toBe("$2,500");
    expect(formatMoney(0.125)).toBe("$0.13");
  });

  it("never renders NaN", () => {
    expect(formatMoney("not a number")).toBe("$0");
    expect(formatQuantity(Number.NaN)).toBe("0");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formats quantities and percentages", () => {
    expect(formatQuantity(12500)).toBe("12,500");
    expect(formatPercent(15.55)).toBe("15.6%");
  });
});

describe("date + month formatters", () => {
  it("reads timestamps on the crew's GMT+7 clock", () => {
    // 20:00 UTC on Aug 31 is already Sep 1 in Asia/Jakarta.
    expect(formatDate("2026-08-31T20:00:00Z")).toBe("Sep 1, 2026");
  });

  it("keeps calendar days and months on UTC so they never shift", () => {
    expect(formatDayShort("2026-08-29")).toBe("Aug 29");
    expect(formatMonth("2026-08")).toBe("August 2026");
    expect(formatMonth("2026-12-01")).toBe("December 2026");
  });

  it("humanizes enum tokens", () => {
    expect(humanizeToken("PAYMENT_SUBMITTED")).toBe("Payment submitted");
  });
});
