// @vitest-environment node
/**
 * The db readers against a fake PostgREST that caps responses at 1000 rows and
 * returns ties in a different order on alternate pages. These tests walk real
 * pages and count what comes back; none of them inspects how a query was built.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFakeSupabase,
  uuid,
  type FakeOptions,
} from "@/lib/db/test-support/fake-postgrest";

const state = vi.hoisted(() => ({
  fake: null as null | { client: unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.fake!.client,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.fake!.client,
}));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
}));

function installFake(options: FakeOptions) {
  const fake = createFakeSupabase(options);
  state.fake = fake;
  return fake;
}

const TS = "2026-09-01T10:00:00.000Z";
const DB_ERROR = { message: "connection reset", code: "08006" };

/** Walk every page of a list and return the ids in the order they arrived. */
async function walk<R extends { id?: string; item_id?: string }>(
  read: (
    page: number,
  ) => Promise<{ rows: R[]; total: number; pageSize: number }>,
): Promise<{ ids: string[]; total: number }> {
  const first = await read(1);
  const pages = Math.ceil(first.total / first.pageSize);
  const ids = first.rows.map((r) => (r.id ?? r.item_id)!);
  for (let p = 2; p <= pages; p += 1) {
    ids.push(...(await read(p)).rows.map((r) => (r.id ?? r.item_id)!));
  }
  return { ids, total: first.total };
}

function expectCompleteAndUnique(
  result: { ids: string[]; total: number },
  expected: number,
) {
  expect(result.total).toBe(expected);
  expect(result.ids).toHaveLength(expected);
  expect(new Set(result.ids).size).toBe(expected);
}

beforeEach(() => {
  state.fake = null;
});

// ── deterministic pagination across ties ───────────────────────────────────
describe("pagination is stable across equal sort keys", () => {
  const N = 47; // crosses at least two page boundaries for every page size

  it("orders (member list): identical created_at", async () => {
    installFake({
      tables: {
        orders: Array.from({ length: N }, (_, i) => ({
          id: uuid(i),
          member_id: "m",
          status: "PENDING",
          created_at: TS,
        })),
      },
    });
    const { listOrders } = await import("@/lib/db/orders");
    expectCompleteAndUnique(await walk((page) => listOrders({ page })), N);
  });

  it("notifications: identical created_at from one fan-out", async () => {
    installFake({
      tables: {
        notifications: Array.from({ length: N }, (_, i) => ({
          id: uuid(i),
          created_at: TS,
          read_at: null,
        })),
      },
    });
    const { listNotifications } = await import("@/lib/db/notifications");
    expectCompleteAndUnique(
      await walk((page) => listNotifications({ page })),
      N,
    );
  });

  it("members: identical display names", async () => {
    installFake({
      tables: {
        members: Array.from({ length: N }, (_, i) => ({
          id: uuid(i),
          display_name: "Same Name",
          username: `u${i}`,
          status: "ACTIVE",
        })),
      },
      rpc: { member_order_counts: () => [] },
    });
    const { listMembers } = await import("@/lib/db/members");
    expectCompleteAndUnique(await walk((page) => listMembers({ page })), N);
  });

  it.each(["name", "price_asc", "price_desc", "recent"] as const)(
    "items sorted by %s: identical names, prices and timestamps",
    async (sort) => {
      installFake({
        tables: {
          items: Array.from({ length: N }, (_, i) => ({
            id: uuid(i),
            name: "Pistol",
            price: 100,
            created_at: TS,
            stock_type: "CATALOGUE",
            archived_at: null,
            active: true,
          })),
        },
      });
      const { listItems } = await import("@/lib/db/items");
      expectCompleteAndUnique(
        await walk((page) => listItems({ page, sort })),
        N,
      );
    },
  );

  it("inventory movements: identical created_at", async () => {
    const itemId = uuid(9999);
    installFake({
      tables: {
        items: [{ id: itemId, name: "Stash" }],
        inventory: [{ item_id: itemId, current_quantity: 5 }],
        inventory_movements: Array.from({ length: N }, (_, i) => ({
          id: uuid(i),
          item_id: itemId,
          created_at: TS,
          performed_by: null,
        })),
        members: [],
      },
    });
    const { getInventoryDetail } = await import("@/lib/db/inventory");
    const ids: string[] = [];
    let total = 0;
    for (let page = 1; page <= 3; page += 1) {
      const d = await getInventoryDetail(itemId, page);
      total = d!.movementTotal;
      ids.push(...d!.movements.map((m) => m.id));
    }
    expectCompleteAndUnique({ ids, total }, N);
  });

  it("cash entries: identical occurred_at and created_at", async () => {
    installFake({
      tables: {
        cash_entries: Array.from({ length: 60 }, (_, i) => ({
          id: uuid(i),
          occurred_at: TS,
          created_at: TS,
          created_by: null,
          handled_by: null,
        })),
      },
    });
    const { listCashEntries } = await import("@/lib/db/cash");
    expectCompleteAndUnique(
      await walk((page) => listCashEntries({ page })),
      60,
    );
  });

  it("activity and audit feeds: identical created_at", async () => {
    const rows = Array.from({ length: 70 }, (_, i) => ({
      id: uuid(i),
      created_at: TS,
      actor_id: null,
    }));
    installFake({ tables: { activity_logs: rows, audit_logs: rows } });
    const { listActivity, listAudit } = await import("@/lib/db/activity");
    expectCompleteAndUnique(await walk((page) => listActivity({ page })), 70);
    expectCompleteAndUnique(await walk((page) => listAudit({ page })), 70);
  });

  it.each(["name", "recent"] as const)(
    "relations sorted by %s: identical names and dates",
    async (sort) => {
      installFake({
        tables: {
          relations: Array.from({ length: N }, (_, i) => ({
            id: uuid(i),
            name: "Same Crew",
            joined_on: "2026-01-01",
            created_at: TS,
            handler_member_id: null,
          })),
        },
      });
      const { listRelations } = await import("@/lib/db/relations");
      expectCompleteAndUnique(
        await walk((page) => listRelations({ page, sort })),
        N,
      );
    },
  );

  it.each(["name", "recent"] as const)(
    "suppliers sorted by %s: identical names and timestamps",
    async (sort) => {
      installFake({
        tables: {
          suppliers: Array.from({ length: N }, (_, i) => ({
            id: uuid(i),
            name: "Dock",
            created_at: TS,
            archived_at: null,
          })),
        },
        rpc: { supplier_item_counts: () => [] },
      });
      const { listSuppliers } = await import("@/lib/db/suppliers");
      expectCompleteAndUnique(
        await walk((page) => listSuppliers({ page, sort })),
        N,
      );
    },
  );

  it("distribution boards: identical issued_at", async () => {
    installFake({
      tables: {
        distributions: Array.from({ length: N }, (_, i) => ({
          id: uuid(i),
          member_id: "m",
          issued_at: TS,
          status: "OPEN",
        })),
        members: [],
      },
    });
    const { listAdminDistributions, listMyDistributions } =
      await import("@/lib/db/distribution");
    expectCompleteAndUnique(
      await walk((page) => listAdminDistributions({ page })),
      N,
    );
    expectCompleteAndUnique(
      await walk((page) => listMyDistributions({ page, memberId: "m" })),
      N,
    );
  });

  it("malformed page input becomes a valid page, never a malformed range", async () => {
    installFake({
      tables: {
        orders: Array.from({ length: 5 }, (_, i) => ({
          id: uuid(i),
          created_at: TS,
        })),
      },
    });
    const { listOrders } = await import("@/lib/db/orders");
    for (const page of [1.5, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await listOrders({ page });
      expect(r.page).toBe(1);
      expect(r.rows).toHaveLength(5);
    }
    expect((await listOrders({ page: 1e9 })).rows).toHaveLength(0);
  });
});

// ── growing child sets past the row cap ────────────────────────────────────
describe("bounded parents with more than 1000 children", () => {
  const suppliers = Array.from({ length: 10 }, (_, i) => ({
    id: uuid(i),
    name: `Supplier ${String(i).padStart(2, "0")}`,
    created_at: TS,
    archived_at: null,
  }));
  const items = Array.from({ length: 150 }, (_, i) => ({
    id: uuid(10_000 + i),
    name: `Item ${i}`,
    category: "OTHER",
    unit: "UNIT",
    image_url: null,
    active: true,
    orderable: true,
    archived_at: null,
  }));
  // 10 suppliers x 150 items = 1500 price-book lines on one page of suppliers
  const lines = suppliers.flatMap((s, si) =>
    items.map((it, ii) => ({
      id: uuid(100_000 + si * 1000 + ii),
      supplier_id: s.id,
      item_id: it.id,
      sell_price: ii % 3 === 0 ? null : 5,
    })),
  );

  it("the grouped supplier view hydrates every line of the page", async () => {
    installFake({ tables: { suppliers, items, supplier_items: lines } });
    const { listSupplierGroups } = await import("@/lib/db/suppliers");
    const r = await listSupplierGroups({ page: 1 });
    expect(r.groups).toHaveLength(10);
    expect(r.groups.reduce((n, g) => n + g.lines.length, 0)).toBe(1500);
    expect(r.groups.every((g) => g.lines.length === 150)).toBe(true);
  });

  it("one supplier's catalogue past 1000 lines comes back whole", async () => {
    const big = Array.from({ length: 1200 }, (_, i) => ({
      id: uuid(500_000 + i),
      supplier_id: suppliers[0]!.id,
      item_id: items[i % items.length]!.id,
    }));
    installFake({ tables: { items, supplier_items: big } });
    const { getSupplierCatalogue } = await import("@/lib/db/suppliers");
    expect(await getSupplierCatalogue(suppliers[0]!.id)).toHaveLength(1200);
  });

  it("supplier counts come from SQL, not from the (capped) child rows", async () => {
    const fake = installFake({
      tables: { suppliers, supplier_items: lines },
      rpc: {
        supplier_item_counts: ({ p_supplier_ids }) =>
          (p_supplier_ids as string[]).map((id) => ({
            supplier_id: id,
            item_count: lines.filter((l) => l.supplier_id === id).length,
            orderable_count: lines.filter(
              (l) => l.supplier_id === id && l.sell_price !== null,
            ).length,
          })),
      },
    });
    const { listSuppliers } = await import("@/lib/db/suppliers");
    const r = await listSuppliers({ page: 1 });
    expect(r.rows.reduce((n, s) => n + s.item_count, 0)).toBe(1500);
    expect(r.rows.every((s) => s.orderable_count === 100)).toBe(true);
    expect(fake.log.some((l) => l.table === "supplier_items")).toBe(false);
  });

  it("the member picker past 1000 active members is complete", async () => {
    installFake({
      tables: {
        members: Array.from({ length: 1300 }, (_, i) => ({
          id: uuid(i),
          display_name: "Crew",
          status: "ACTIVE",
        })),
      },
    });
    const { listMemberOptions } = await import("@/lib/db/members");
    const all = await listMemberOptions();
    expect(new Set(all.map((m) => m.id)).size).toBe(1300);
  });

  it("the admin submission grid uses the SQL totals over every line", async () => {
    const mt = [
      {
        id: uuid(1),
        code: "MS",
        name: "Metal",
        unit: "UNIT",
        active: true,
        sort_order: 1,
      },
      {
        id: uuid(2),
        code: "EB",
        name: "Bottle",
        unit: "UNIT",
        active: true,
        sort_order: 2,
      },
    ];
    installFake({
      tables: { submission_material_types: mt },
      rpc: {
        admin_submission_month: () => ({
          hasPeriod: true,
          targets: { [uuid(1)]: 10 },
          rows: [
            {
              memberId: uuid(50),
              memberName: null,
              rank: null,
              active: false,
              submissionId: uuid(60),
              status: "CONFIRMED",
              submittedAt: TS,
              confirmedAt: TS,
              note: null,
              reviewNote: null,
              receivedById: null,
              receivedByName: null,
              quantities: { [uuid(1)]: 7 },
            },
          ],
          // 400 submissions x 7, as summed in SQL
          totals: { [uuid(1)]: "2800", [uuid(2)]: 2800 },
          counts: {
            members: 1,
            confirmed: 1,
            pending: 0,
            rejected: 0,
            missing: 0,
          },
        }),
      },
    });
    const { getAdminSubmissionMonth } = await import("@/lib/db/submissions");
    const m = await getAdminSubmissionMonth("2026-09-01");
    expect(m.totals).toEqual({ [uuid(1)]: 2800, [uuid(2)]: 2800 });
    expect(m.materials[0]!.target).toBe(10);
    expect(m.rows[0]).toMatchObject({
      memberName: "Former member",
      rank: "SOLDIER",
    });
  });
});

// ── failures are not absence ───────────────────────────────────────────────
describe("a query failure is never rendered as zero, empty or missing", () => {
  it("cash balance", async () => {
    installFake({ failTables: { cash_account: DB_ERROR } });
    const { getCashBalance } = await import("@/lib/db/cash");
    await expect(getCashBalance()).rejects.toMatchObject(DB_ERROR);
  });

  it("cash balance: no account row yet is a genuine zero", async () => {
    installFake({ tables: { cash_account: [] } });
    const { getCashBalance } = await import("@/lib/db/cash");
    await expect(getCashBalance()).resolves.toBe(0);
  });

  it("inventory detail: item, quantity and movement failures", async () => {
    const itemId = uuid(1);
    const base = {
      items: [{ id: itemId, name: "Stash" }],
      inventory: [{ item_id: itemId, current_quantity: 9 }],
      inventory_movements: [],
    };
    const { getInventoryDetail } = await import("@/lib/db/inventory");
    for (const table of ["items", "inventory", "inventory_movements"]) {
      installFake({ tables: base, failTables: { [table]: DB_ERROR } });
      await expect(getInventoryDetail(itemId)).rejects.toMatchObject(DB_ERROR);
    }
    installFake({ tables: base });
    expect(await getInventoryDetail(uuid(2))).toBeNull();
    expect(await getInventoryDetail("not-a-uuid")).toBeNull();
    expect((await getInventoryDetail(itemId))!.currentQuantity).toBe(9);
  });

  it("submission readers: period, targets and submission failures", async () => {
    const { getMonthTargets, getMyMonthSubmission, getAdminSubmissionMonth } =
      await import("@/lib/db/submissions");

    installFake({ failTables: { submission_periods: DB_ERROR } });
    await expect(getMonthTargets("2026-09-01")).rejects.toMatchObject(DB_ERROR);
    await expect(
      getMyMonthSubmission("2026-09-01", uuid(1)),
    ).rejects.toMatchObject(DB_ERROR);

    installFake({
      tables: {
        submission_periods: [{ id: uuid(5), period_month: "2026-09-01" }],
      },
      failTables: { submission_period_targets: DB_ERROR },
    });
    await expect(getMonthTargets("2026-09-01")).rejects.toMatchObject(DB_ERROR);

    installFake({ tables: { submission_periods: [] } });
    await expect(getMonthTargets("2026-09-01")).resolves.toEqual({});
    await expect(getMyMonthSubmission("2026-09-01", uuid(1))).resolves.toEqual({
      submission: null,
      quantities: {},
    });

    installFake({
      tables: { submission_material_types: [] },
      failRpc: { admin_submission_month: DB_ERROR },
    });
    await expect(getAdminSubmissionMonth("2026-09-01")).rejects.toMatchObject(
      DB_ERROR,
    );
  });

  it("member names and detail readers", async () => {
    const { getMemberNames, getMember } = await import("@/lib/db/members");
    const { getOrderDetail } = await import("@/lib/db/orders");
    const { getItem } = await import("@/lib/db/items");
    const { getSupplier } = await import("@/lib/db/suppliers");
    const { getRelation } = await import("@/lib/db/relations");
    const { getCashEntryDetail } = await import("@/lib/db/cash");

    installFake({
      failTables: {
        members: DB_ERROR,
        orders: DB_ERROR,
        items: DB_ERROR,
        suppliers: DB_ERROR,
        relations: DB_ERROR,
        cash_entries: DB_ERROR,
      },
    });
    const id = uuid(1);
    for (const read of [
      () => getMemberNames([id]),
      () => getMember(id),
      () => getOrderDetail(id),
      () => getItem(id),
      () => getSupplier(id),
      () => getRelation(id),
      () => getCashEntryDetail(id),
    ]) {
      await expect(read()).rejects.toMatchObject(DB_ERROR);
    }

    // Absence is still absence.
    installFake({
      tables: {
        members: [],
        orders: [],
        items: [],
        suppliers: [],
        relations: [],
        cash_entries: [],
      },
    });
    expect(await getMember(id)).toBeNull();
    expect(await getOrderDetail(id)).toBeNull();
    expect(await getItem("../etc")).toBeNull();
  });

  it("order detail: a failed line or timeline read is not an order with no lines", async () => {
    const id = uuid(1);
    const { getOrderDetail } = await import("@/lib/db/orders");
    for (const table of ["order_items", "order_timeline"]) {
      installFake({
        tables: { orders: [{ id }], order_items: [], order_timeline: [] },
        failTables: { [table]: DB_ERROR },
      });
      await expect(getOrderDetail(id)).rejects.toMatchObject(DB_ERROR);
    }
  });

  it("unread notification count", async () => {
    installFake({ failTables: { notifications: DB_ERROR } });
    const { getUnreadNotificationCount, listNotifications } =
      await import("@/lib/db/notifications");
    await expect(getUnreadNotificationCount()).rejects.toMatchObject(DB_ERROR);
    await expect(listNotifications({})).rejects.toMatchObject(DB_ERROR);
  });
});
