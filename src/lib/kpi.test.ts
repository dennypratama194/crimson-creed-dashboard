import { describe, expect, it } from "vitest";

import { pctDelta } from "@/lib/kpi";

describe("pctDelta", () => {
  it("reports growth and decline against the previous period", () => {
    expect(pctDelta(12, 10)).toEqual({ pct: 20, direction: "up" });
    expect(pctDelta(9, 10)).toEqual({ pct: -10, direction: "down" });
  });

  it("is flat when nothing changed", () => {
    expect(pctDelta(7, 7)).toEqual({ pct: 0, direction: "flat" });
    expect(pctDelta(0, 0)).toEqual({ pct: 0, direction: "flat" });
  });

  it("treats growth from a zero baseline as +100%", () => {
    expect(pctDelta(5, 0)).toEqual({ pct: 100, direction: "up" });
  });

  it("compares a negative baseline (cash deficit) by magnitude", () => {
    expect(pctDelta(-50, -100)).toEqual({ pct: 50, direction: "up" });
    expect(pctDelta(-150, -100)).toEqual({ pct: -50, direction: "down" });
  });

  it("rounds to one decimal place", () => {
    expect(pctDelta(1, 3).pct).toBe(-66.7);
    expect(pctDelta(4, 3).pct).toBe(33.3);
  });
});
