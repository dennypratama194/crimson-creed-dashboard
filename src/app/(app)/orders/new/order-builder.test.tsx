import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderableItem } from "@/lib/db/orders";
import { OrderBuilder } from "@/app/(app)/orders/new/order-builder";

const action = vi.hoisted(() => ({ createOrderAction: vi.fn() }));
vi.mock("@/app/(app)/orders/actions", () => action);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const item = (id: string, name: string, price: number): OrderableItem => ({
  id,
  name,
  price,
  category: "AMMO",
  unit: "ROUND",
  description: null,
  image_url: null,
});
const ITEMS = [
  item("a", "9mm Rounds", 2.5),
  item("b", "Rope", 10),
  item("c", "Lockpick", 4),
];

beforeEach(() => action.createOrderAction.mockReset());

describe("OrderBuilder", () => {
  it("adds, steps and types quantities per card, and totals them", async () => {
    render(<OrderBuilder items={ITEMS} />);
    fireEvent.click(
      within(
        screen.getByText("Rope").closest("div.flex-col")!.parentElement!,
      ).getByRole("button", { name: /Add/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Increase quantity of Rope" }),
    );
    expect(screen.getByLabelText("Quantity of Rope")).toHaveValue("2");

    fireEvent.click(
      within(
        screen.getByText("9mm Rounds").closest("div.flex-col")!.parentElement!,
      ).getByRole("button", { name: /Add/ }),
    );
    fireEvent.change(screen.getByLabelText("Quantity of 9mm Rounds"), {
      target: { value: "4x" },
    });
    expect(screen.getByLabelText("Quantity of 9mm Rounds")).toHaveValue("4");
    // the other card kept its own quantity
    expect(screen.getByLabelText("Quantity of Rope")).toHaveValue("2");
    expect(screen.getByText("2 items")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Decrease quantity of Rope" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Decrease quantity of Rope" }),
    );
    expect(screen.queryByLabelText("Quantity of Rope")).toBeNull();
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("filters the grid by search", async () => {
    render(<OrderBuilder items={ITEMS} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search items" }), {
      target: { value: "rope" },
    });
    await act(async () => {});
    expect(screen.queryByText("Lockpick")).toBeNull();
    expect(screen.getByText("Rope")).toBeInTheDocument();
  });

  it("submits the chosen lines", async () => {
    action.createOrderAction.mockResolvedValue({
      ok: true,
      data: { orderId: "o1" },
    });
    render(<OrderBuilder items={ITEMS} />);
    fireEvent.click(
      within(
        screen.getByText("Lockpick").closest("div.flex-col")!.parentElement!,
      ).getByRole("button", { name: /Add/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Place order" }));
    await act(async () => {});
    expect(action.createOrderAction).toHaveBeenCalledWith({
      items: [{ item_id: "c", quantity: 1 }],
      note: null,
    });
  });
});
