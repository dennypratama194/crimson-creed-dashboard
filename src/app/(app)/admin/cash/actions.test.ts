// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordCashEntryAction,
  reverseCashEntryAction,
} from "@/app/(app)/admin/cash/actions";

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

const ENTRY = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const ADMIN = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

const validEntry = {
  direction: "OUT",
  amount: 1200,
  category: "OPERATING_EXPENSE",
  handledBy: ADMIN,
  occurredAt: "2026-09-10",
  note: "  warehouse rent ",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSuperAdmin.mockResolvedValue({ id: "admin-1" });
  mocks.rpc.mockResolvedValue({ data: { id: ENTRY }, error: null });
});

describe("recordCashEntryAction", () => {
  it("maps the validated entry onto record_cash_entry", async () => {
    const result = await recordCashEntryAction(validEntry);
    expect(result).toEqual({ ok: true, data: { entryId: ENTRY } });
    expect(mocks.rpc).toHaveBeenCalledWith("record_cash_entry", {
      p_direction: "OUT",
      p_amount: 1200,
      p_category: "OPERATING_EXPENSE",
      p_occurred_at: "2026-09-10T00:00:00Z",
      p_note: "warehouse rent",
      p_allow_negative: false,
      p_handled_by: ADMIN,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/cash");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("rejects a category from the wrong direction before the database", async () => {
    const result = await recordCashEntryAction({
      ...validEntry,
      category: "SALES_REVENUE",
    });
    expect(result).toEqual({
      ok: false,
      error: "Pick a category that matches income or expense",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires a Super Admin", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(recordCashEntryAction(validEntry)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the balance guard message", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "This expense would take the balance below zero",
        code: "23514",
      },
    });
    const result = await recordCashEntryAction(validEntry);
    expect(result.error).toBe("This expense would take the balance below zero");
  });
});

describe("reverseCashEntryAction", () => {
  it("requires a reason", async () => {
    const result = await reverseCashEntryAction({
      entryId: ENTRY,
      reason: " ",
    });
    expect(result).toEqual({ ok: false, error: "A reason is required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reverses and revalidates the ledger, entry and dashboard", async () => {
    const result = await reverseCashEntryAction({
      entryId: ENTRY,
      reason: "duplicate",
    });
    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("reverse_cash_entry", {
      p_entry_id: ENTRY,
      p_reason: "duplicate",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/admin/cash/${ENTRY}`);
  });
});
