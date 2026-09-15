import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  adminDashboardPayload,
  cashSummaryPayload,
  distributionSummaryPayload,
  itemDeleteImpact,
  memberDashboardPayload,
  myProductionAssignmentsPayload,
  parseRpcPayload,
} from "@/lib/db/contracts";
import type { Database } from "@/lib/database.types";

/**
 * Keeps the two halves of the type story honest:
 *
 *   src/lib/database.types.ts   generated schema — rewritten whole by db:types
 *   src/lib/db/contracts.ts     hand-authored jsonb payload contracts
 *
 * The split exists because `db:types` used to overwrite a file that held
 * AdminDashboardPayload and friends. These tests fail if the two are merged
 * back together, and if a contract stops describing a function the schema
 * actually declares.
 */

const TYPES_FILE = join(process.cwd(), "src", "lib", "database.types.ts");
const source = readFileSync(TYPES_FILE, "utf8");

/**
 * The declared return type of one entry in the generated `Functions` block.
 * Read by scanning rather than by regex over the whole file: an `Args` line
 * contains braces of its own, so "everything up to the next }" lands in the
 * wrong place.
 */
function returnTypeOf(rpc: string): string | null {
  const open = source.indexOf(`${rpc}: {`);
  if (open === -1) return null;
  const close = source.indexOf("\n      };", open);
  const block = source.slice(open, close === -1 ? undefined : close);
  return /Returns:\s*([^;]+);/.exec(block)?.[1]?.trim() ?? null;
}

/** Every RPC a contract in this module speaks for. */
const CONTRACTED_RPCS = [
  "admin_dashboard",
  "member_dashboard",
  "cash_summary",
  "my_distribution_summary",
  "distribution_summary",
  "my_production_assignments",
  "item_delete_impact",
] as const satisfies readonly (keyof Database["public"]["Functions"])[];

describe("generated types stay free of application contracts", () => {
  it("declares itself generated output", () => {
    expect(source).toMatch(/GENERATED|generated output/i);
  });

  it("holds no hand-authored payload type", () => {
    // Anything matching these names in the generated file means someone put a
    // contract back where the generator will delete it.
    for (const name of [
      "export type AdminDashboardPayload",
      "export type CashSummaryPayload",
      "export type DistributionSummaryPayload",
      "export type EarningsSummaryPayload",
      "export type PayslipPayload",
    ]) {
      expect(source).not.toContain(name);
    }
  });

  it("points at the module that does hold them", () => {
    expect(source).toContain("src/lib/db/contracts.ts");
  });
});

describe("contracts describe functions the schema actually declares", () => {
  it("names only real RPCs", () => {
    for (const rpc of CONTRACTED_RPCS) {
      // `Functions` is a type, so the check is on the generated source: the
      // function has to be declared, and to return opaque Json — which is what
      // makes a runtime-checked contract necessary in the first place.
      expect(source).toMatch(new RegExp(`\\b${rpc}:\\s*\\{`));
    }
  });

  it("types every contracted RPC as opaque Json", () => {
    for (const rpc of CONTRACTED_RPCS) {
      expect(returnTypeOf(rpc), `${rpc} should return Json`).toBe("Json");
    }
  });
});

describe("parseRpcPayload", () => {
  const validSummary = {
    openDraws: 2,
    openAmount: 900,
    settledDraws: 1,
    settledAmount: 450,
  };

  it("accepts a well-formed payload", () => {
    expect(
      parseRpcPayload(distributionSummaryPayload, validSummary, "x"),
    ).toEqual(validSummary);
  });

  it("coerces a Postgres numeric that arrived as a string", () => {
    // sum() over numeric serializes as a string often enough that a strict
    // z.number() here would break the page rather than catch a real problem.
    const parsed = parseRpcPayload(
      distributionSummaryPayload,
      { ...validSummary, openAmount: "900.00" },
      "x",
    );
    expect(parsed.openAmount).toBe(900);
  });

  it("names the RPC and the field when the shape has drifted", () => {
    expect(() =>
      parseRpcPayload(
        distributionSummaryPayload,
        { openDraws: 1 },
        "my_distribution_summary",
      ),
    ).toThrow(/my_distribution_summary\(\).*openAmount/s);
  });

  it("rejects a null payload rather than passing it through", () => {
    expect(() =>
      parseRpcPayload(cashSummaryPayload, null, "cash_summary"),
    ).toThrow(/cash_summary/);
  });

  it("strips keys the contract does not claim", () => {
    const parsed = parseRpcPayload(
      distributionSummaryPayload,
      { ...validSummary, somethingNew: true },
      "x",
    );
    expect(parsed).not.toHaveProperty("somethingNew");
  });
});

describe("payload shapes", () => {
  it("admin_dashboard requires every KPI the tiles read", () => {
    expect(() =>
      parseRpcPayload(
        adminDashboardPayload,
        {
          kpis: { activeMembers: 1 },
          attention: {},
          orderTrend: [],
          recentActivity: [],
          lowStockItems: [],
          recentOrders: [],
        },
        "admin_dashboard",
      ),
    ).toThrow(/admin_dashboard/);
  });

  it("member_dashboard carries its nested distribution summary", () => {
    const parsed = parseRpcPayload(
      memberDashboardPayload,
      {
        open: 1,
        completed: 3,
        completed7d: 1,
        unread: 0,
        distribution: validDistribution(),
        submissionState: "NONE",
        periodMonth: "2026-09-01",
        activeOrders: [],
        recentOrders: [],
        recentNotifications: [],
        submissionDebt: [],
      },
      "member_dashboard",
    );
    expect(parsed.distribution.openAmount).toBe(900);
  });

  it("my_production_assignments returns rows and a total", () => {
    const parsed = parseRpcPayload(
      myProductionAssignmentsPayload,
      { rows: [{ id: "a", crew: [{ id: "l" }] }], total: "12" },
      "my_production_assignments",
    );
    expect(parsed.total).toBe(12);
    expect(parsed.rows).toHaveLength(1);
  });

  it("item_delete_impact separates blockers from what is cleared", () => {
    const parsed = parseRpcPayload(
      itemDeleteImpact,
      {
        itemId: "i",
        itemName: "Blue Meth",
        blockers: { orderLines: 0, draws: "3", submissionMaterial: 0 },
        clears: {
          stockMovements: 12,
          onHand: 1000,
          productionAssignments: 1,
          supplierListings: 0,
          distributionRate: 1,
        },
      },
      "item_delete_impact",
    );
    // The blocker counts are what the dialog refuses on; they must survive the
    // string/number ambiguity intact.
    expect(parsed.blockers.draws).toBe(3);
    expect(parsed.clears.onHand).toBe(1000);
  });
});

function validDistribution() {
  return {
    openDraws: 2,
    openAmount: 900,
    settledDraws: 1,
    settledAmount: 450,
  };
}
