import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Pagination } from "@/components/patterns/pagination";

const push = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/admin/orders",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  push.mockReset();
  search = "";
});

describe("Pagination", () => {
  it("shows the visible row range and page count", () => {
    render(<Pagination page={2} pageSize={25} total={60} />);
    expect(screen.getByText("26–50 of 60")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("clamps the range on the last page", () => {
    render(<Pagination page={3} pageSize={25} total={60} />);
    expect(screen.getByText("51–60 of 60")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("handles an empty result set", () => {
    render(<Pagination page={1} pageSize={25} total={0} />);
    expect(screen.getByText("No results")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("keeps other filters and drops ?page for the first page", () => {
    search = "status=PENDING&page=2";
    render(<Pagination page={2} pageSize={25} total={60} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(push).toHaveBeenCalledWith("/admin/orders?status=PENDING");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(push).toHaveBeenLastCalledWith(
      "/admin/orders?status=PENDING&page=3",
    );
  });
});
