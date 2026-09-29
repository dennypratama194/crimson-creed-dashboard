import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditDetailDialog } from "@/app/(app)/admin/audit/audit-detail-dialog";

const ID = "00000000-0000-4000-8000-000000000001";
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const flush = () => act(async () => {});

function open() {
  fireEvent.click(screen.getByRole("button", { name: "View" }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("AuditDetailDialog", () => {
  it("fetches nothing until opened, then shows the snapshots", async () => {
    fetchMock.mockImplementation(() =>
      json({ oldValues: { price: 5 }, newValues: { price: 7 } }),
    );
    render(<AuditDetailDialog entryId={ID} action="Item updated" />);
    expect(fetchMock).not.toHaveBeenCalled();

    open();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/audit/${ID}`,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText(/"price": 7/)).toBeInTheDocument();
  });

  it("reopening a loaded entry does not fetch again", async () => {
    fetchMock.mockImplementation(() =>
      json({ oldValues: null, newValues: { a: 1 } }),
    );
    render(<AuditDetailDialog entryId={ID} action="Item updated" />);
    open();
    await flush();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await flush();
    open();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an entry with neither snapshot says so", async () => {
    fetchMock.mockImplementation(() =>
      json({ oldValues: null, newValues: null }),
    );
    render(<AuditDetailDialog entryId={ID} action="Signed in" />);
    open();
    await flush();
    expect(
      screen.getByText(/No before or after values were recorded/),
    ).toBeInTheDocument();
  });

  it("an entry that is gone (retention) is not an error", async () => {
    fetchMock.mockImplementation(() => json({ error: "not_found" }, 404));
    render(<AuditDetailDialog entryId={ID} action="Item updated" />);
    open();
    await flush();
    expect(screen.getByText(/no longer available/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a failure offers a retry that recovers", async () => {
    fetchMock.mockImplementationOnce(() => json({ error: "x" }, 503));
    render(<AuditDetailDialog entryId={ID} action="Item updated" />);
    open();
    await flush();
    expect(screen.getByText(/Couldn.t load this entry/)).toBeInTheDocument();

    fetchMock.mockImplementation(() =>
      json({ oldValues: { a: 1 }, newValues: null }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Before")).toBeInTheDocument();
  });

  it("closing mid-load aborts the request", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise(() => {});
    });
    render(<AuditDetailDialog entryId={ID} action="Item updated" />);
    open();
    await flush();
    expect(signal?.aborted).toBe(false);
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await flush();
    expect(signal?.aborted).toBe(true);
  });
});
