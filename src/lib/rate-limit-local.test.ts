import { describe, expect, it } from "vitest";

import { createLocalLimiter } from "@/lib/rate-limit-local";

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (seconds: number) => {
      t += seconds * 1000;
    },
  };
}

const RULE = { limit: 3, windowSeconds: 60, blockSeconds: 300 };

describe("createLocalLimiter", () => {
  it("allows up to the limit, then blocks for blockSeconds", () => {
    const c = clock();
    const limiter = createLocalLimiter({ now: c.now });
    expect([1, 2, 3].map(() => limiter.hit("k", RULE))).toEqual([0, 0, 0]);
    expect(limiter.hit("k", RULE)).toBe(300);
    c.advance(100);
    expect(limiter.hit("k", RULE)).toBe(200);
  });

  it("starts a fresh window once the old one has elapsed", () => {
    const c = clock();
    const limiter = createLocalLimiter({ now: c.now });
    limiter.hit("k", RULE);
    limiter.hit("k", RULE);
    c.advance(61);
    expect(limiter.hit("k", RULE)).toBe(0);
    expect(limiter.hit("k", RULE)).toBe(0);
    expect(limiter.hit("k", RULE)).toBe(0);
    expect(limiter.hit("k", RULE)).toBeGreaterThan(0);
  });

  it("releases a block after it expires", () => {
    const c = clock();
    const limiter = createLocalLimiter({ now: c.now });
    for (let i = 0; i < 4; i++) limiter.hit("k", RULE);
    c.advance(301);
    expect(limiter.hit("k", RULE)).toBe(0);
  });

  it("keeps keys independent and clears on success", () => {
    const limiter = createLocalLimiter({ now: clock().now });
    for (let i = 0; i < 4; i++) limiter.hit("a", RULE);
    expect(limiter.hit("b", RULE)).toBe(0);
    expect(limiter.hit("a", RULE)).toBeGreaterThan(0);
    limiter.clear("a");
    expect(limiter.hit("a", RULE)).toBe(0);
  });

  it("defaults the block to the window length", () => {
    const limiter = createLocalLimiter({ now: clock().now });
    const rule = { limit: 1, windowSeconds: 90 };
    limiter.hit("k", rule);
    expect(limiter.hit("k", rule)).toBe(90);
  });

  it("bounds memory by evicting the oldest key", () => {
    const limiter = createLocalLimiter({ now: clock().now, maxKeys: 2 });
    for (let i = 0; i < 4; i++) limiter.hit("oldest", RULE);
    limiter.hit("b", RULE);
    limiter.hit("c", RULE); // evicts "oldest"
    expect(limiter.hit("oldest", RULE)).toBe(0);
  });
});
