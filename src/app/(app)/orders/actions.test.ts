// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelOrderAction,
  createOrderAction,
  submitPaymentAction,
} from "@/app/(app)/orders/actions";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireActiveMember: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireActiveMember: mocks.requireActiveMember,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

const ITEM = "3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c";
const ORDER = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const ADMIN = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const OTHER_MEMBER = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireActiveMember.mockResolvedValue({ id: "member-1" });
  mocks.rpc.mockResolvedValue({ data: { id: ORDER }, error: null });
});

describe("createOrderAction", () => {
  it("sends only validated lines + note — never member, price or total", async () => {
    const result = await createOrderAction({
      items: [
        { item_id: ITEM, quantity: 2, price: 0.01, member_id: OTHER_MEMBER },
      ],
      note: "  rush  ",
      member_id: OTHER_MEMBER,
      total: 1,
    });

    expect(result).toEqual({ ok: true, data: { orderId: ORDER } });
    expect(mocks.rpc).toHaveBeenCalledWith("create_order", {
      p_items: [{ item_id: ITEM, quantity: 2 }],
      p_note: "rush",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders");
  });

  it("surfaces the database quota refusal (0079) with its retry guidance", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: "CC429",
        message: "You're placing orders too fast. Try again in about 1 minute.",
        details: "retry_after_seconds=42",
      },
    });
    const result = await createOrderAction({
      items: [{ item_id: ITEM, quantity: 1 }],
    });
    expect(result).toEqual({
      ok: false,
      error: "You're placing orders too fast. Try again in about 1 minute.",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("stops before the database on invalid input", async () => {
    const result = await createOrderAction({
      items: [{ item_id: ITEM, quantity: 0 }],
    });
    expect(result).toEqual({ ok: false, error: "Must be greater than zero" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("never reaches the RPC without an active session", async () => {
    mocks.requireActiveMember.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(
      createOrderAction({ items: [{ item_id: ITEM, quantity: 1 }] }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not leak raw database errors", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'relation "orders" does not exist', code: "42P01" },
    });
    const result = await createOrderAction({
      items: [{ item_id: ITEM, quantity: 1 }],
    });
    expect(result).toEqual({ ok: false, error: "Could not place the order." });
  });

  it("passes through a business-rule message", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Hand in your owed submissions first", code: "P0001" },
    });
    const result = await createOrderAction({
      items: [{ item_id: ITEM, quantity: 1 }],
    });
    expect(result.error).toBe("Hand in your owed submissions first");
  });
});

describe("submitPaymentAction", () => {
  it("records the payment against the named recipient", async () => {
    const result = await submitPaymentAction({ orderId: ORDER, paidTo: ADMIN });
    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_order_payment", {
      p_order_id: ORDER,
      p_paid_to: ADMIN,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/orders/${ORDER}`);
  });

  it("rejects a missing recipient before the database", async () => {
    const result = await submitPaymentAction({ orderId: ORDER, paidTo: "" });
    expect(result).toEqual({ ok: false, error: "Choose who you paid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("cancelOrderAction", () => {
  it("trims the reason and sends null for a blank one", async () => {
    await cancelOrderAction(ORDER, "  changed my mind ");
    expect(mocks.rpc).toHaveBeenLastCalledWith("cancel_order", {
      p_order_id: ORDER,
      p_reason: "changed my mind",
    });
    await cancelOrderAction(ORDER, "   ");
    expect(mocks.rpc).toHaveBeenLastCalledWith("cancel_order", {
      p_order_id: ORDER,
      p_reason: null,
    });
  });

  it("surfaces the ownership refusal from the RPC", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message: "You can only cancel your own pending orders",
        code: "42501",
      },
    });
    const result = await cancelOrderAction(ORDER);
    expect(result).toEqual({
      ok: false,
      error: "You can only cancel your own pending orders",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
