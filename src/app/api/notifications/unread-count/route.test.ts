// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: { tag: "request-client" },
  createRequestClient: vi.fn(),
  getSessionUserId: vi.fn(),
  countUnreadNotifications: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestClient: mocks.createRequestClient,
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionUserId: mocks.getSessionUserId,
}));
vi.mock("@/lib/db/notifications", () => ({
  countUnreadNotifications: mocks.countUnreadNotifications,
}));

import { GET } from "@/app/api/notifications/unread-count/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createRequestClient.mockResolvedValue(mocks.client);
  mocks.getSessionUserId.mockResolvedValue("user-1");
});

describe("GET /api/notifications/unread-count", () => {
  it("returns the caller's count, never shared-cacheable", async () => {
    mocks.countUnreadNotifications.mockResolvedValue(4);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 4 });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("builds one client and uses it for the session and the count", async () => {
    mocks.countUnreadNotifications.mockResolvedValue(0);
    await GET();
    expect(mocks.createRequestClient).toHaveBeenCalledTimes(1);
    expect(mocks.getSessionUserId).toHaveBeenCalledWith(mocks.client);
    expect(mocks.countUnreadNotifications).toHaveBeenCalledWith(mocks.client);
  });

  it("a failed count is an error, not { count: 0 }", async () => {
    mocks.countUnreadNotifications.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).not.toHaveProperty("count");
    expect(JSON.stringify(body)).not.toMatch(/db down/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not query without a session", async () => {
    mocks.getSessionUserId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.countUnreadNotifications).not.toHaveBeenCalled();
  });
});
