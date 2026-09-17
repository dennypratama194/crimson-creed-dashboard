// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getUser: mocks.getUser }));
vi.mock("@/lib/db/notifications", () => ({
  getUnreadNotificationCount: mocks.getUnreadNotificationCount,
}));

import { GET } from "@/app/api/notifications/unread-count/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ id: "user-1" });
});

describe("GET /api/notifications/unread-count", () => {
  it("returns the caller's count, never shared-cacheable", async () => {
    mocks.getUnreadNotificationCount.mockResolvedValue(4);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 4 });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("a failed count is an error, not { count: 0 }", async () => {
    mocks.getUnreadNotificationCount.mockRejectedValue(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).not.toHaveProperty("count");
    expect(JSON.stringify(body)).not.toMatch(/db down/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not query without a session", async () => {
    mocks.getUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mocks.getUnreadNotificationCount).not.toHaveBeenCalled();
  });
});
