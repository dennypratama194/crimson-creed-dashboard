// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("independent deployment branding", () => {
  it("keeps Crimson as the default", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_ID", "");
    const { brand, brandCss } = await import("./brand");
    expect(brand.name).toBe("Crimson Creed");
    expect(brand.icon).toBe("/brands/crimson/icon.png");
    expect(brandCss()).toBe("");
  });

  it("uses the second brand without inheriting Crimson assets or colors", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_ID", "second-gang");
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "Second Gang");
    vi.stubEnv("NEXT_PUBLIC_BRAND_COLOR_LIGHT", "#234567");
    vi.stubEnv("NEXT_PUBLIC_BRAND_COLOR_DARK", "#abcdef");
    const { brand, brandCss } = await import("./brand");
    expect(brand).toMatchObject({
      name: "Second Gang",
      logo: null,
      mark: null,
      icon: null,
    });
    expect(brandCss()).toContain("#234567");
    expect(brandCss()).toContain("#abcdef");
    expect(brandCss()).not.toContain("#a5502b");
    const { MEMBER_EMAIL_DOMAIN } = await import("./auth/member-credentials");
    expect(MEMBER_EMAIL_DOMAIN).toBe("second-gang.local");
  });

  it("refuses an unnamed second deployment", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_ID", "unnamed");
    vi.stubEnv("NEXT_PUBLIC_BRAND_NAME", "");
    await expect(import("./brand")).rejects.toThrow("NEXT_PUBLIC_BRAND_NAME");
  });
});
