import { describe, expect, it } from "vitest";

import { clientIpFromHeaders } from "@/lib/client-ip";

function headersOf(values: Record<string, string>) {
  const h = new Headers(values);
  return { get: (name: string) => h.get(name) };
}

describe("clientIpFromHeaders", () => {
  it("ignores spoofable forwarding headers off-platform", () => {
    const h = headersOf({ "x-forwarded-for": "203.0.113.9" });
    expect(clientIpFromHeaders(h, {})).toBeNull();
  });

  it("trusts the platform-set x-real-ip on Vercel", () => {
    const h = headersOf({
      "x-real-ip": "198.51.100.4",
      "x-forwarded-for": "203.0.113.9",
    });
    expect(clientIpFromHeaders(h, { VERCEL: "1" })).toBe("198.51.100.4");
  });

  it("falls back to the first forwarded hop on Vercel", () => {
    const h = headersOf({
      "x-vercel-forwarded-for": " 198.51.100.4 , 10.0.0.1",
    });
    expect(clientIpFromHeaders(h, { VERCEL: "1" })).toBe("198.51.100.4");
  });

  it("honours an explicit trusted-proxy opt-in", () => {
    const h = headersOf({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientIpFromHeaders(h, { TRUST_PROXY_HEADERS: "1" })).toBe(
      "203.0.113.9",
    );
  });

  it("returns null when a trusted platform sent no IP", () => {
    expect(clientIpFromHeaders(headersOf({}), { VERCEL: "1" })).toBeNull();
  });

  it("caps an oversized header value", () => {
    const h = headersOf({ "x-real-ip": "1".repeat(500) });
    expect(clientIpFromHeaders(h, { VERCEL: "1" })).toHaveLength(64);
  });
});
