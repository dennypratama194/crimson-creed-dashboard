// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { submitProductionLogAction } from "@/app/(app)/production/actions";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireActiveMember: vi.fn(),
  checkRateLimit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireActiveMember: mocks.requireActiveMember,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const PRODUCT = "3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c";
const LOG = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireActiveMember.mockResolvedValue({ id: "member-1" });
  mocks.checkRateLimit.mockResolvedValue(null);
  mocks.rpc.mockResolvedValue({ data: { id: LOG }, error: null });
});

describe("submitProductionLogAction", () => {
  it("sends quantity + product only; the RPC prices the payout", async () => {
    const result = await submitProductionLogAction({
      itemId: PRODUCT,
      quantity: 40,
      occurredAt: "2026-09-12",
      payout: 999_999,
      unitRate: 999,
    });
    expect(result).toEqual({ ok: true, data: { logId: LOG } });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_production_log", {
      p_item_id: PRODUCT,
      p_quantity: 40,
      p_occurred_at: "2026-09-12T12:00:00Z",
      p_note: null,
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "prod:log:member-1",
      { limit: 20 },
      expect.any(String),
    );
  });

  it("rejects a non-positive quantity before the database", async () => {
    const result = await submitProductionLogAction({
      itemId: PRODUCT,
      quantity: 0,
    });
    expect(result).toEqual({ ok: false, error: "Must be greater than zero" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
