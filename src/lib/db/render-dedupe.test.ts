// @vitest-environment node
/**
 * Reads a page repeats must reach the database once per render — and no more
 * than once per render, never across requests.
 *
 * `React.cache` only memoizes inside a Server Component render; anywhere else
 * (a Server Action body, a Route Handler, this test runner) it calls straight
 * through. So `react` is replaced here with the same two behaviours: inside
 * `render()` each wrapped function memoizes by its arguments for the length of
 * that render; outside it, nothing is memoized. The fake PostgREST then counts
 * the requests that actually go out.
 */
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFakeSupabase,
  uuid,
  type FakeOptions,
} from "@/lib/db/test-support/fake-postgrest";

const state = vi.hoisted(() => ({
  fake: null as null | { client: unknown },
  scope: null as null | Map<unknown, Map<string, unknown>>,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  cache:
    <A extends unknown[], R>(fn: (...args: A) => R) =>
    (...args: A): R => {
      if (!state.scope) return fn(...args);
      const memo = state.scope.get(fn) ?? new Map<string, unknown>();
      state.scope.set(fn, memo);
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key) as R;
    },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.fake!.client,
}));

async function render<T>(body: () => Promise<T>): Promise<T> {
  state.scope = new Map();
  try {
    return await body();
  } finally {
    state.scope = null;
  }
}

function installFake(options: FakeOptions) {
  const fake = createFakeSupabase(options);
  state.fake = fake;
  return fake;
}
const readsOf = (fake: ReturnType<typeof installFake>, table: string) =>
  fake.log.filter((l) => l.table === table).length;

const MONTH = "2026-09-01";
const ADMIN = uuid(1);

function submissionsFixture() {
  const tables = {
    submission_material_types: [
      { id: uuid(10), code: "MS", name: "Scrap", active: true, sort_order: 1 },
    ],
    submission_periods: [{ id: uuid(20), period_month: MONTH }],
    submission_period_targets: [
      { period_id: uuid(20), material_type_id: uuid(10), target_quantity: 5 },
    ],
    member_submissions: [
      { id: uuid(30), period_id: uuid(20), member_id: ADMIN },
    ],
    member_submission_lines: [
      {
        member_submission_id: uuid(30),
        material_type_id: uuid(10),
        quantity: 4,
      },
    ],
  };
  const fake = installFake({
    tables,
    rpc: {
      admin_submission_month_page: () => ({
        hasPeriod: true,
        targets: {},
        total: 0,
        rows: [],
        totals: {},
        counts: {
          members: 0,
          confirmed: 0,
          pending: 0,
          rejected: 0,
          missing: 0,
        },
      }),
    },
  });
  return { fake, tables };
}

/** Everything /admin/submissions reads, the way the page calls it. */
async function adminSubmissionsPage() {
  const s = await import("@/lib/db/submissions");
  return Promise.all([
    s.getAdminSubmissionMonth(MONTH, { page: 1 }),
    s.getMaterialTypes(),
    s.getMonthTargets(MONTH),
    s.getMyMonthSubmission(MONTH, ADMIN),
  ]);
}

beforeEach(() => {
  state.fake = null;
  state.scope = null;
});

describe("one render, one read", () => {
  it("/admin/submissions reads material types and the period once each", async () => {
    const { fake } = submissionsFixture();
    const [, materials, targets, mine] = await render(adminSubmissionsPage);
    expect(materials).toHaveLength(1);
    expect(targets).toEqual({ [uuid(10)]: 5 });
    expect(mine.quantities).toEqual({ [uuid(10)]: 4 });

    expect(readsOf(fake, "submission_material_types")).toBe(1); // was 2
    expect(readsOf(fake, "submission_periods")).toBe(1); // was 2
  });

  it("the Company cut page reads the rates once for both lists", async () => {
    const fake = installFake({
      tables: {
        distribution_rates: [
          { item_id: uuid(1), unit_rate: 3, updated_at: "2026-09-01" },
        ],
        items: [
          {
            id: uuid(1),
            name: "Priced",
            unit: "UNIT",
            stock_type: "CATALOGUE",
            category: "PRODUCT",
            archived_at: null,
          },
          {
            id: uuid(2),
            name: "Unpriced",
            unit: "UNIT",
            stock_type: "CATALOGUE",
            category: "PRODUCT",
            archived_at: null,
          },
        ],
      },
    });
    const d = await import("@/lib/db/distribution");
    const [rates, priceable] = await render(() =>
      Promise.all([d.listDistributionRates(), d.listPriceableItems()]),
    );
    expect(rates.map((r) => r.item_id)).toEqual([uuid(1)]);
    expect(priceable.map((i) => i.id)).toEqual([uuid(2)]);
    expect(readsOf(fake, "distribution_rates")).toBe(1); // was 2
  });
});

describe("never across renders, requests or actions", () => {
  it("a second render reads again and sees what changed in between", async () => {
    const { fake, tables } = submissionsFixture();
    const [, , before] = await render(adminSubmissionsPage);
    expect(before).toEqual({ [uuid(10)]: 5 });

    // A Server Action between the two renders changes the month's target.
    tables.submission_period_targets[0]!.target_quantity = 9;

    const [, , after] = await render(adminSubmissionsPage);
    expect(after).toEqual({ [uuid(10)]: 9 });
    expect(readsOf(fake, "submission_material_types")).toBe(2);
    expect(readsOf(fake, "submission_periods")).toBe(2);
  });

  it("outside a render (a Server Action body) nothing is memoized", async () => {
    const { fake } = submissionsFixture();
    const s = await import("@/lib/db/submissions");
    await s.getMaterialTypes();
    await s.getMaterialTypes();
    expect(readsOf(fake, "submission_material_types")).toBe(2);
  });

  it("a different month is a different period lookup", async () => {
    const { fake } = submissionsFixture();
    const s = await import("@/lib/db/submissions");
    await render(() =>
      Promise.all([s.getMonthTargets(MONTH), s.getMonthTargets("2026-08-01")]),
    );
    expect(readsOf(fake, "submission_periods")).toBe(2);
  });
});

describe("the paged admin grid", () => {
  it("asks SQL for one page and keeps the whole-month counts it returns", async () => {
    const calls: Record<string, unknown>[] = [];
    installFake({
      tables: { submission_material_types: [] },
      rpc: {
        admin_submission_month_page: (args) => {
          calls.push(args);
          return {
            hasPeriod: true,
            targets: {},
            total: 431,
            rows: [],
            totals: { [uuid(10)]: "2800" },
            counts: {
              members: 431,
              confirmed: 134,
              pending: 133,
              rejected: 133,
              missing: 31,
            },
          };
        },
      },
    });
    const s = await import("@/lib/db/submissions");
    const m = await s.getAdminSubmissionMonth(MONTH, { page: "3" });
    expect(calls).toEqual([
      { p_period_month: MONTH, p_limit: 25, p_offset: 50 },
    ]);
    expect(m).toMatchObject({ total: 431, page: 3, pageSize: 25 });
    expect(m.counts.members).toBe(431);
  });
});
