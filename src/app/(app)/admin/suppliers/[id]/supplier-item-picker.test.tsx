import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SupplierItemPicker } from "@/app/(app)/admin/suppliers/[id]/supplier-item-picker";

const SUPPLIER = "00000000-0000-4000-8000-000000000001";
const fetchMock = vi.fn();
const flush = () => act(async () => {});

function pageOf(names: string[], page = 1, total = names.length) {
  return {
    rows: names.map((name, i) => ({
      id: `00000000-0000-4000-8000-${String(page * 100 + i).padStart(12, "0")}`,
      name,
      category: "OTHER",
    })),
    total,
    page,
    pageSize: 20,
  };
}
const respond = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const search = () => screen.getByRole("textbox", { name: "Search items" });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("SupplierItemPicker", () => {
  it("loads one page when it mounts (the dialog opening)", async () => {
    fetchMock.mockImplementation(() => respond(pageOf(["Rope", "Tape"])));
    render(<SupplierItemPicker supplierId={SUPPLIER} />);
    expect(screen.getByLabelText("Loading items")).toBeInTheDocument();
    await flush();
    expect(urls()).toEqual([
      `/api/admin/suppliers/${SUPPLIER}/available-items`,
    ]);
    expect(screen.getByRole("radio", { name: /Rope/ })).toBeInTheDocument();
  });

  it("typing alone fetches nothing; Enter searches without submitting the form", async () => {
    fetchMock.mockImplementation(() => respond(pageOf(["Rope"])));
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SupplierItemPicker supplierId={SUPPLIER} />
      </form>,
    );
    await flush();

    fireEvent.change(search(), { target: { value: "r" } });
    fireEvent.change(search(), { target: { value: "ro" } });
    fireEvent.change(search(), { target: { value: " rope  " } });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(search(), { key: "Enter" });
    await flush();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(urls()[1]).toBe(
      `/api/admin/suppliers/${SUPPLIER}/available-items?q=rope`,
    );

    // Same normalized term again: no request.
    fireEvent.change(search(), { target: { value: "rope" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pages, and keeps the chosen item across pages for the form", async () => {
    fetchMock.mockImplementation((url: string) =>
      respond(
        url.includes("page=2")
          ? pageOf(["Zinc"], 2, 21)
          : pageOf(["Rope"], 1, 21),
      ),
    );
    const { container } = render(<SupplierItemPicker supplierId={SUPPLIER} />);
    await flush();
    fireEvent.click(screen.getByRole("radio", { name: /Rope/ }));
    const hidden = () =>
      container.querySelector<HTMLInputElement>('input[name="itemId"]')!;
    const ropeId = hidden().value;
    expect(ropeId).not.toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Next items" }));
    await flush();
    expect(urls()[1]).toContain("page=2");
    expect(screen.getByRole("radio", { name: /Zinc/ })).toBeInTheDocument();
    expect(hidden().value).toBe(ropeId);
    expect(screen.getByText("Rope")).toBeInTheDocument(); // "Selected: Rope"
  });

  it("explains an empty catalogue and an empty search differently", async () => {
    fetchMock.mockImplementation(() => respond(pageOf([])));
    render(<SupplierItemPicker supplierId={SUPPLIER} />);
    await flush();
    expect(
      screen.getByText("Every item is already listed for this supplier."),
    ).toBeInTheDocument();

    fireEvent.change(search(), { target: { value: "zzz" } });
    fireEvent.keyDown(search(), { key: "Enter" });
    await flush();
    expect(screen.getByText(/No unlisted items match/)).toBeInTheDocument();
  });

  it("a failed load offers a retry, and a malformed body counts as failed", async () => {
    fetchMock.mockImplementationOnce(() => respond({ error: "x" }, 503));
    render(<SupplierItemPicker supplierId={SUPPLIER} />);
    await flush();
    expect(screen.getByText(/Couldn.t load the item list/)).toBeInTheDocument();

    fetchMock.mockImplementationOnce(() => respond({ rows: "nope" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(screen.getByText(/Couldn.t load the item list/)).toBeInTheDocument();

    fetchMock.mockImplementation(() => respond(pageOf(["Rope"])));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(screen.getByRole("radio", { name: /Rope/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("aborts its request when the dialog closes", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise(() => {});
    });
    const { unmount } = render(<SupplierItemPicker supplierId={SUPPLIER} />);
    await flush();
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
