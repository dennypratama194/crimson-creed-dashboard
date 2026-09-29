import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  backoffDelay,
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

describe("NotificationBell cadence", () => {
  it("polls every three minutes with a one-minute freshness gap", () => {
    expect(POLL_MS).toBe(180_000);
    expect(MIN_REFRESH_GAP_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("an hour on a visible tab costs at most 20 requests (was 60)", async () => {
    fetchMock.mockImplementation(() => respond(1));
    render(<NotificationBell initialCount={1} countedAt={1} />);
    await act(async () => {
      vi.advanceTimersByTime(60 * 60_000);
    });
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(20);
  });
});

describe("NotificationBell backoff", () => {
  const fail503 = () => Promise.resolve(new Response("{}", { status: 503 }));

  async function tick(ms: number) {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }
  async function focus() {
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
  }

  it("doubles per failure and stops growing at the cap", () => {
    expect(backoffDelay(0)).toBe(0);
    expect(backoffDelay(1)).toBe(BACKOFF_BASE_MS);
    expect(backoffDelay(2)).toBe(BACKOFF_BASE_MS * 2);
    expect(backoffDelay(3)).toBe(BACKOFF_BASE_MS * 4);
    expect(backoffDelay(4)).toBe(BACKOFF_MAX_MS);
    expect(backoffDelay(1_000)).toBe(BACKOFF_MAX_MS);
  });

  it("focus, visibility and navigation all wait out the backoff", async () => {
    fetchMock.mockImplementation(fail503);
    const { rerender } = render(
      <NotificationBell initialCount={null} countedAt={1} />,
    );
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // mount, failed

    await tick(MIN_REFRESH_GAP_MS + 1);
    await focus();
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    nav.pathname = "/orders";
    rerender(<NotificationBell initialCount={null} countedAt={1} />);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await tick(BACKOFF_BASE_MS);
    await focus();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("consecutive failures back off further; a success resets the cadence", async () => {
    fetchMock.mockImplementation(fail503);
    render(<NotificationBell initialCount={6} countedAt={1} />);

    await tick(POLL_MS); // attempt 1 fails -> wait 2 min
    await tick(POLL_MS); // attempt 2 fails -> wait 4 min
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await tick(POLL_MS); // 3 min < 4 min: skipped
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(badge()).toBe("6");

    fetchMock.mockImplementation(() => respond(11));
    await tick(POLL_MS); // backoff over: succeeds
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(badge()).toBe("11");

    await tick(MIN_REFRESH_GAP_MS + 1);
    await focus(); // normal gate again, no backoff left
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("a malformed body counts as a failure and keeps the badge", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ count: "lots" }), { status: 200 }),
      ),
    );
    render(<NotificationBell initialCount={4} countedAt={1} />);
    await tick(POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(badge()).toBe("4");
    await focus();
    expect(fetchMock).toHaveBeenCalledTimes(1); // backing off

    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response("<html>", { status: 200 })),
    );
    await tick(BACKOFF_BASE_MS);
    await focus();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(badge()).toBe("4");
  });

  it("a network error backs off too", async () => {
    fetchMock.mockImplementation(() =>
      Promise.reject(new TypeError("offline")),
    );
    render(<NotificationBell initialCount={2} countedAt={1} />);
    await tick(POLL_MS);
    await tick(MIN_REFRESH_GAP_MS + 1);
    await focus();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(badge()).toBe("2");
  });

  it("a fresh server count ends the backoff", async () => {
    fetchMock.mockImplementation(fail503);
    const { rerender } = render(
      <NotificationBell initialCount={1} countedAt={1} />,
    );
    await tick(POLL_MS); // fails
    rerender(<NotificationBell initialCount={3} countedAt={2} />);
    await flush();
    expect(badge()).toBe("3");

    fetchMock.mockImplementation(() => respond(5));
    await tick(MIN_REFRESH_GAP_MS + 1); // well inside the old 2-minute backoff
    await focus();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(badge()).toBe("5");
  });
});
