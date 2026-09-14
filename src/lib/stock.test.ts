import { describe, expect, it } from "vitest";

import { stockState } from "@/lib/stock";

describe("stockState", () => {
  it("is out at zero or below, whatever the threshold", () => {
    expect(stockState(0, 0)).toBe("out");
    expect(stockState(0, 20)).toBe("out");
    expect(stockState(-4, 20)).toBe("out");
  });

  it("is low at or under a positive threshold", () => {
    expect(stockState(20, 20)).toBe("low");
    expect(stockState(1, 20)).toBe("low");
  });

  it("is ok above the threshold", () => {
    expect(stockState(21, 20)).toBe("ok");
  });

  it("never reports low when no threshold is set", () => {
    expect(stockState(1, 0)).toBe("ok");
  });
});
