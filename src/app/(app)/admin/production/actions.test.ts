// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { reviewProductionLogAction } from "@/app/(app)/admin/production/actions";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireSuperAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const LOG = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSuperAdmin.mockResolvedValue({ id: "admin-1" });
  mocks.rpc.mockResolvedValue({ data: { id: LOG }, error: null });
});

describe("reviewProductionLogAction", () => {
  it("approves through review_production_log", async () => {
    const result = await reviewProductionLogAction({
      logId: LOG,
      approve: true,
      note: "  ",
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("review_production_log", {
      p_log_id: LOG,
      p_approve: true,
      p_note: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/production/logs");
  });

  it("refuses a rejection without a reason", async () => {
    const result = await reviewProductionLogAction({
      logId: LOG,
      approve: false,
    });
    expect(result).toEqual({
      ok: false,
      error: "A reason is required to reject",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a Super Admin", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(
      reviewProductionLogAction({ logId: LOG, approve: true }),
    ).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the payroll lock refusal", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "This log has already been reviewed", code: "P0001" },
    });
    const result = await reviewProductionLogAction({
      logId: LOG,
      approve: false,
      note: "late",
    });
    expect(result).toEqual({
      ok: false,
      error: "This log has already been reviewed",
    });
  });
});
