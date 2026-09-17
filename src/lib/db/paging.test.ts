// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  chunk,
  clampPage,
  MAX_PAGE,
  pageBounds,
  readAllRows,
} from "@/lib/db/paging";
import { createFakeSupabase, uuid } from "@/lib/db/test-support/fake-postgrest";

describe("clampPage", () => {
  it.each([
    [undefined, 1],
    [null, 1],
    ["", 1],
    ["abc", 1],
    [0, 1],
    [-3, 1],
    ["-3", 1],
    [1.9, 1],
    ["2.5", 2],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    ["Infinity", 1],
    [7, 7],
    ["7", 7],
    [1e12, MAX_PAGE],
  ])("%s -> %s", (input, expected) => {
    expect(clampPage(input)).toBe(expected);
  });

  it("always yields integer range bounds", () => {
    for (const input of [1.5, "3.7", -1, Number.NaN, 1e12]) {
      const { from, to } = pageBounds(input, 20);
      expect(Number.isInteger(from) && Number.isInteger(to)).toBe(true);
      expect(from).toBeGreaterThanOrEqual(0);
      expect(to - from + 1).toBe(20);
    }
  });
});

describe("readAllRows against a 1000-row response cap", () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: uuid(i) }));

  it("a plain select is silently truncated — the failure mode", async () => {
    const fake = createFakeSupabase({ tables: { t: rows } });
    const { data } = await fake.client.from("t").select("*").order("id");
    expect((data as unknown[]).length).toBe(1000);
  });

  it("reads every row in bounded batches", async () => {
    const fake = createFakeSupabase({ tables: { t: rows } });
    const out = await readAllRows<{ id: string }>(
      (from, to) =>
        fake.client
          .from("t")
          .select("*")
          .order("id", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: { id: string }[] | null;
          error: unknown;
        }>,
    );
    expect(out).toHaveLength(2500);
    expect(new Set(out.map((r) => r.id)).size).toBe(2500);
  });

  it("throws on a query error instead of returning a partial list", async () => {
    const fake = createFakeSupabase({
      tables: { t: rows },
      failTables: { t: { message: "boom", code: "XX000" } },
    });
    await expect(
      readAllRows(
        (from, to) =>
          fake.client
            .from("t")
            .select("*")
            .order("id")
            .range(from, to) as never,
      ),
    ).rejects.toMatchObject({ message: "boom" });
  });

  it("fails loudly past its ceiling rather than truncating", async () => {
    const fake = createFakeSupabase({ tables: { t: rows } });
    await expect(
      readAllRows(
        (from, to) =>
          fake.client
            .from("t")
            .select("*")
            .order("id")
            .range(from, to) as never,
        { limit: 1000 },
      ),
    ).rejects.toThrow(/needs real pagination/);
  });
});

describe("chunk", () => {
  it("splits into bounded groups without losing values", () => {
    const groups = chunk(
      Array.from({ length: 250 }, (_, i) => i),
      100,
    );
    expect(groups.map((g) => g.length)).toEqual([100, 100, 50]);
    expect(groups.flat()).toHaveLength(250);
  });
});
