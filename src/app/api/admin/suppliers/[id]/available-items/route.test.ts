// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { tag: "request-client" },
  createRequestClient: vi.fn(),
  authorizeSuperAdmin: vi.fn(),
  listAvailableItemsForSupplier: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestClient: mocks.createRequestClient,
}));
vi.mock("@/lib/auth/session", () => ({
  authorizeSuperAdmin: mocks.authorizeSuperAdmin,
}));
vi.mock("@/lib/db/suppliers", () => ({
  listAvailableItemsForSupplier: mocks.listAvailableItemsForSupplier,
}));

import { GET } from "@/app/api/admin/suppliers/[id]/available-items/route";

const ID = "00000000-0000-4000-8000-000000000001";
const call = (id: string, query = "") =>
  GET(
    new NextRequest(
      `http://localhost/api/admin/suppliers/${id}/available-items${query}`,
    ),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createRequestClient.mockResolvedValue(mocks.client);
  mocks.authorizeSuperAdmin.mockResolvedValue({ ok: true, member: {} });
  mocks.listAvailableItemsForSupplier.mockResolvedValue({
    rows: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
});

describe("GET /api/admin/suppliers/[id]/available-items", () => {
  it.each([
    ["a malformed supplier id", "nope", ""],
    ["an oversized search", ID, `?q=${"x".repeat(81)}`],
    ["a nonsense page", ID, "?page=-4"],
  ])("rejects %s before any read", async (_label, id, query) => {
    const res = await call(id, query);
    expect(res.status).toBe(400);
    expect(mocks.listAvailableItemsForSupplier).not.toHaveBeenCalled();
  });

  it.each([401, 403] as const)(
    "refuses a non-admin (%i) without reading",
    async (status) => {
      mocks.authorizeSuperAdmin.mockResolvedValue({ ok: false, status });
      expect((await call(ID)).status).toBe(status);
      expect(mocks.listAvailableItemsForSupplier).not.toHaveBeenCalled();
    },
  );

  it("passes the trimmed search and page through, on the one client", async () => {
    const res = await call(ID, "?q=%20rope%20&page=3");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listAvailableItemsForSupplier).toHaveBeenCalledWith(
      ID,
      { search: "rope", page: 3 },
      mocks.client,
    );
  });

  it("a failed read is a 503", async () => {
    mocks.listAvailableItemsForSupplier.mockRejectedValue(new Error("db"));
    expect((await call(ID)).status).toBe(503);
  });
});
