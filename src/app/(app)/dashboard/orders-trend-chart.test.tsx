import { describe, expect, it } from "vitest";

import { toWeekly } from "@/app/(app)/dashboard/orders-trend-chart";

function days(counts: number[]) {
  return counts.map((count, i) => ({
    date: `2026-06-${String(i + 1).padStart(2, "0")}`,
    count,
  }));
}

describe("toWeekly", () => {
  it("sums fixed 7-day buckets labelled by their first day", () => {
    const weekly = toWeekly(days([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]));
    expect(weekly).toEqual([
      { date: "2026-06-01", count: 7 },
      { date: "2026-06-08", count: 14 },
    ]);
  });

  it("keeps a trailing partial week", () => {
    const weekly = toWeekly(days([1, 2, 3, 4, 5, 6, 7, 10, 20]));
    expect(weekly).toEqual([
      { date: "2026-06-01", count: 28 },
      { date: "2026-06-08", count: 30 },
    ]);
  });

  it("preserves the total across the 90-day range", () => {
    const daily = Array.from({ length: 90 }, (_, i) => ({
      date: `d${i}`,
      count: i % 4,
    }));
    const weekly = toWeekly(daily);
    expect(weekly).toHaveLength(13);
    expect(weekly.reduce((s, p) => s + p.count, 0)).toBe(
      daily.reduce((s, p) => s + p.count, 0),
    );
  });

  it("returns nothing for no data", () => {
    expect(toWeekly([])).toEqual([]);
  });
});
