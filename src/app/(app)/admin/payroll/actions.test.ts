// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { finalizePayrollRunAction } from "@/app/(app)/admin/payroll/actions";

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

const RUN = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSuperAdmin.mockResolvedValue({ id: "admin-1" });
  mocks.rpc.mockResolvedValue({ data: { id: RUN }, error: null });
});

describe("finalizePayrollRunAction", () => {
  it("finalizes and refreshes payroll + member earnings", async () => {
    await expect(finalizePayrollRunAction(RUN)).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_payroll_run", {
      p_run_id: RUN,
    });
    for (const path of [
      "/admin/payroll",
      `/admin/payroll/${RUN}`,
      "/production",
    ]) {
      expect(mocks.revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("requires a Super Admin", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(finalizePayrollRunAction(RUN)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reports a double finalize without revalidating", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Only DRAFT runs can be finalized", code: "P0001" },
    });
    await expect(finalizePayrollRunAction(RUN)).resolves.toEqual({
      ok: false,
      error: "Only DRAFT runs can be finalized",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
