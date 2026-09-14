// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  completeOrderAction,
  recordDistributionAction,
  verifyPaymentAction,
} from "@/app/(app)/admin/orders/actions";

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

const ORDER = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const ADMIN = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSuperAdmin.mockResolvedValue({ id: "admin-1" });
  mocks.rpc.mockResolvedValue({ data: { id: ORDER }, error: null });
});

const cases = [
  {
    name: "verifyPaymentAction",
    run: () => verifyPaymentAction(ORDER, "", ADMIN),
    rpc: "verify_order_payment",
    args: { p_order_id: ORDER, p_note: null, p_paid_to: ADMIN },
  },
  {
    name: "recordDistributionAction",
    run: () => recordDistributionAction(ORDER, "handed over at the dock"),
    rpc: "record_order_distribution",
    args: { p_order_id: ORDER, p_note: "handed over at the dock" },
  },
  {
    name: "completeOrderAction",
    run: () => completeOrderAction(ORDER),
    rpc: "complete_order",
    args: { p_order_id: ORDER },
  },
];

describe.each(cases)("$name", ({ run, rpc, args }) => {
  it("requires a Super Admin before touching the database", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("calls its RPC and revalidates the order views", async () => {
    await expect(run()).resolves.toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith(rpc, args);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/orders");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/orders/${ORDER}`);
  });

  it("reports a refused transition without leaking internals", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'column "x" does not exist', code: "42703" },
    });
    const result = await run();
    expect(result.ok).toBe(false);
    expect(result.error).not.toMatch(/column|does not exist/);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
