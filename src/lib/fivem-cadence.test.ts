import { describe, expect, it } from "vitest";

import {
  FIVEM_DIRECTORY_REFRESH_INTERVAL_MS,
  FIVEM_ERROR_REFRESH_MAX_MS,
  FIVEM_OFFLINE_REFRESH_INTERVAL_MS,
  FIVEM_REFRESH_INTERVAL_MS,
} from "@/lib/constants/fivem";
import { fivemRefreshInterval, formatCadence } from "@/lib/fivem-cadence";

describe("fivemRefreshInterval", () => {
  it("polls a directory snapshot slowly even when it reports online", () => {
    expect(fivemRefreshInterval({ online: true, source: "directory" })).toBe(
      FIVEM_DIRECTORY_REFRESH_INTERVAL_MS,
    );
    expect(FIVEM_DIRECTORY_REFRESH_INTERVAL_MS).toBeGreaterThan(
      FIVEM_REFRESH_INTERVAL_MS,
    );
  });

  it("keeps the live cadence only for the game server's own roster", () => {
    expect(fivemRefreshInterval({ online: true, source: "server" })).toBe(
      FIVEM_REFRESH_INTERVAL_MS,
    );
    expect(fivemRefreshInterval({ online: false, source: "server" })).toBe(
      FIVEM_OFFLINE_REFRESH_INTERVAL_MS,
    );
  });

  it("backs off on failed polls, bounded, whatever the last snapshot said", () => {
    const live = { online: true, source: "server" } as const;
    expect(fivemRefreshInterval(live, 1)).toBe(
      FIVEM_OFFLINE_REFRESH_INTERVAL_MS,
    );
    expect(fivemRefreshInterval(live, 2)).toBe(
      FIVEM_OFFLINE_REFRESH_INTERVAL_MS * 2,
    );
    expect(fivemRefreshInterval(live, 50)).toBe(FIVEM_ERROR_REFRESH_MAX_MS);
    // recovered: fetchFailureCount is back to 0
    expect(fivemRefreshInterval(live, 0)).toBe(FIVEM_REFRESH_INTERVAL_MS);
  });

  it("describes the cadence the way the UI shows it", () => {
    expect(formatCadence(FIVEM_REFRESH_INTERVAL_MS)).toBe("30s");
    expect(formatCadence(FIVEM_DIRECTORY_REFRESH_INTERVAL_MS)).toBe("2 min");
  });
});
