import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MIN_REFRESH_GAP_MS,
  NotificationBell,
  POLL_MS,
} from "@/components/layout/notification-bell";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

let visibility: DocumentVisibilityState = "visible";
const fetchMock = vi.fn();

function respond(count: number) {
  return Promise.resolve(
    new Response(JSON.stringify({ count }), { status: 200 }),
  );
}
const badge = () => screen.queryByText(/^\d+\+?$/)?.textContent ?? null;
const flush = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  nav.pathname = "/dashboard";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NotificationBell", () => {
  it("uses the server count without an immediate request", async () => {
    render(<NotificationBell initialCount={3} countedAt={1} />);
    await flush();
    expect(badge()).toBe("3");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches once on mount when the server could not supply a count", async () => {
    fetchMock.mockImplementation(() => respond(5));
    render(<NotificationBell initialCount={null} countedAt={1} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(badge()).toBe("5");
  });

  it("does not poll a hidden tab", async () => {
    fetchMock.mockImplementation(() => respond(1));
    render(<NotificationBell initialCount={0} countedAt={1} />);
    visibility = "hidden";
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS * 3);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("coalesces focus + visibilitychange into one request, and never overlaps", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementation(
      () => new Promise<Response>((r) => (resolve = r)),
    );
    render(<NotificationBell initialCount={0} countedAt={1} />);
    await act(async () => {
      vi.advanceTimersByTime(MIN_REFRESH_GAP_MS + 1);
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(new Response(JSON.stringify({ count: 2 }), { status: 200 }));
    });
    expect(badge()).toBe("2");
    // just refreshed: the next burst inside the gap sends nothing
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the last known count when a refresh fails", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response("{}", { status: 503 })),
    );
    render(<NotificationBell initialCount={7} countedAt={1} />);
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(badge()).toBe("7");

    fetchMock.mockImplementation(() =>
      Promise.reject(new TypeError("offline")),
    );
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
    });
    expect(badge()).toBe("7");
  });

  it("aborts an outstanding request on unmount", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise(() => {});
    });
    const { unmount } = render(
      <NotificationBell initialCount={null} countedAt={1} />,
    );
    await flush();
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("a revalidated layout (mark read) replaces the badge without a request", async () => {
    const { rerender } = render(
      <NotificationBell initialCount={4} countedAt={1} />,
    );
    rerender(<NotificationBell initialCount={0} countedAt={2} />);
    await flush();
    expect(badge()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a client navigation refreshes, once the count is no longer fresh", async () => {
    fetchMock.mockImplementation(() => respond(9));
    const { rerender } = render(
      <NotificationBell initialCount={1} countedAt={1} />,
    );
    nav.pathname = "/orders";
    rerender(<NotificationBell initialCount={1} countedAt={1} />);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled(); // still fresh

    await act(async () => {
      vi.advanceTimersByTime(MIN_REFRESH_GAP_MS + 1);
    });
    nav.pathname = "/production";
    rerender(<NotificationBell initialCount={1} countedAt={1} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(badge()).toBe("9");
  });
});
