// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { tag: "request-client" },
  createRequestClient: vi.fn(),
  authorizeSuperAdmin: vi.fn(),
  getAuditDetail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestClient: mocks.createRequestClient,
}));
vi.mock("@/lib/auth/session", () => ({
  authorizeSuperAdmin: mocks.authorizeSuperAdmin,
}));
vi.mock("@/lib/db/activity", () => ({
  getAuditDetail: mocks.getAuditDetail,
}));

import { GET } from "@/app/api/admin/audit/[id]/route";

const ID = "00000000-0000-4000-8000-000000000001";
const call = (id: string) =>
  GET(new NextRequest(`http://localhost/api/admin/audit/${id}`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createRequestClient.mockResolvedValue(mocks.client);
  mocks.authorizeSuperAdmin.mockResolvedValue({ ok: true, member: {} });
});

describe("GET /api/admin/audit/[id]", () => {
  it("rejects a malformed id before any read", async () => {
    const res = await call("1; drop table audit_logs");
    expect(res.status).toBe(400);
    expect(mocks.getAuditDetail).not.toHaveBeenCalled();
  });

  it.each([401, 403] as const)(
    "refuses a non-admin (%i) without reading the entry",
    async (status) => {
      mocks.authorizeSuperAdmin.mockResolvedValue({ ok: false, status });
      const res = await call(ID);
      expect(res.status).toBe(status);
      expect(mocks.getAuditDetail).not.toHaveBeenCalled();
    },
  );

  it("returns the snapshots for a Super Admin, on the one client", async () => {
    mocks.getAuditDetail.mockResolvedValue({
      oldValues: { a: 1 },
      newValues: null,
    });
    const res = await call(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ oldValues: { a: 1 }, newValues: null });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.createRequestClient).toHaveBeenCalledTimes(1);
    expect(mocks.getAuditDetail).toHaveBeenCalledWith(ID, mocks.client);
  });

  it("an absent (or expired) entry is a 404", async () => {
    mocks.getAuditDetail.mockResolvedValue(null);
    expect((await call(ID)).status).toBe(404);
  });

  it("a failed read is a 503 with no internals", async () => {
    mocks.getAuditDetail.mockRejectedValue(new Error("relation secret"));
    const res = await call(ID);
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
  });
});
