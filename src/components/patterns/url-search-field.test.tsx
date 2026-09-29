import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  normalizeSearch,
  UrlSearchField,
} from "@/components/patterns/url-search-field";

const nav = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => "/admin/items",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const field = () => screen.getByRole("searchbox", { name: "Search items" });
const Subject = () => (
  <UrlSearchField placeholder="Search name or code…" label="Search items" />
);

beforeEach(() => {
  nav.search = "";
  nav.push.mockReset();
  nav.replace.mockReset();
});

describe("normalizeSearch", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeSearch("  red   rope \t")).toBe("red rope");
    expect(normalizeSearch("   ")).toBe("");
  });
});

describe("UrlSearchField", () => {
  it("typing alone never navigates", () => {
    render(<Subject />);
    for (const v of ["r", "ro", "rop", "rope"]) {
      fireEvent.change(field(), { target: { value: v } });
    }
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("Enter submits once, keeps other filters and resets the page", () => {
    nav.search = "category=AMMO&status=active&sort=recent&page=4";
    render(<Subject />);
    fireEvent.change(field(), { target: { value: "  red   rope " } });
    fireEvent.submit(field());
    expect(nav.push).toHaveBeenCalledTimes(1);
    const url = new URL(nav.push.mock.calls[0]![0], "http://x");
    expect(url.pathname).toBe("/admin/items");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: "AMMO",
      status: "active",
      sort: "recent",
      q: "red rope",
    });
  });

  it("the Search button submits too", () => {
    render(<Subject />);
    fireEvent.change(field(), { target: { value: "rope" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(nav.push).toHaveBeenCalledWith("/admin/items?q=rope");
  });

  it("an unchanged (normalized) term does not navigate", () => {
    nav.search = "q=red+rope&page=2";
    render(<Subject />);
    fireEvent.change(field(), { target: { value: " red  rope " } });
    fireEvent.submit(field());
    expect(nav.push).not.toHaveBeenCalled();
    expect(field()).toHaveValue("red rope");
  });

  it("clearing the field removes the term", () => {
    nav.search = "q=rope&status=archived";
    render(<Subject />);
    fireEvent.change(field(), { target: { value: "   " } });
    fireEvent.submit(field());
    expect(nav.push).toHaveBeenCalledWith("/admin/items?status=archived");
  });

  it("follows the URL on back / forward", async () => {
    nav.search = "q=rope";
    const { rerender } = render(<Subject />);
    expect(field()).toHaveValue("rope");

    nav.search = "q=tape";
    rerender(<Subject />);
    await act(async () => {});
    expect(field()).toHaveValue("tape");

    nav.search = "";
    rerender(<Subject />);
    await act(async () => {});
    expect(field()).toHaveValue("");
  });

  it("an unrelated filter change keeps an unsubmitted draft", () => {
    nav.search = "q=rope";
    const { rerender } = render(<Subject />);
    fireEvent.change(field(), { target: { value: "rope and" } });
    nav.search = "q=rope&status=archived";
    rerender(<Subject />);
    expect(field()).toHaveValue("rope and");
  });
});
