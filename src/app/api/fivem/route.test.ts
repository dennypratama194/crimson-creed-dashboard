// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { tag: "request-client" },
  createRequestClient: vi.fn(),
  authorizeSuperAdmin: vi.fn(),
  getServerSnapshot: vi.fn(),
  probeServer: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestClient: mocks.createRequestClient,
}));
vi.mock("@/lib/auth/session", () => ({
  authorizeSuperAdmin: mocks.authorizeSuperAdmin,
}));
vi.mock("@/lib/services/fivem", () => ({
  getServerSnapshot: mocks.getServerSnapshot,
  probeServer: mocks.probeServer,
}));

import { GET } from "@/app/api/fivem/route";

const req = (q = "") => new NextRequest(`http://localhost/api/fivem${q}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createRequestClient.mockResolvedValue(mocks.client);
  mocks.getServerSnapshot.mockResolvedValue({ online: true });
});

describe("GET /api/fivem", () => {
  it.each([401, 403] as const)(
    "refuses (%i) before the cached snapshot is touched",
    async (status) => {
      mocks.authorizeSuperAdmin.mockResolvedValue({ ok: false, status });
      const res = await GET(req());
      expect(res.status).toBe(status);
      expect(mocks.getServerSnapshot).not.toHaveBeenCalled();
      expect((await GET(req("?debug=1"))).status).toBe(status);
      expect(mocks.probeServer).not.toHaveBeenCalled();
    },
  );

  it("a failed authorization read is a 503, not a snapshot", async () => {
    mocks.authorizeSuperAdmin.mockRejectedValue(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(mocks.getServerSnapshot).not.toHaveBeenCalled();
  });

  it("serves a Super Admin, reusing the one client it authorized with", async () => {
    mocks.authorizeSuperAdmin.mockResolvedValue({ ok: true, member: {} });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mocks.createRequestClient).toHaveBeenCalledTimes(1);
    expect(mocks.authorizeSuperAdmin).toHaveBeenCalledWith(mocks.client);
    expect(mocks.getServerSnapshot).toHaveBeenCalledWith({
      supabase: mocks.client,
    });
  });
});
