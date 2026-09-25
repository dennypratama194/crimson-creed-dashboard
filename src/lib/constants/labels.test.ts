// @vitest-environment node
/**
 * MEMBER_RANK_LABEL layers a brand's rank-name overrides (src/lib/brand.ts)
 * onto the shared English defaults. The underlying MemberRank enum values are
 * the same in every brand's database; only this display text changes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("MEMBER_RANK_LABEL", () => {
  it("uses the default English labels for Crimson", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_ID", "");
    const { MEMBER_RANK_LABEL } = await import("@/lib/constants/labels");
    expect(MEMBER_RANK_LABEL).toEqual({
      BOSS: "Boss",
      UNDER_BOSS: "Under Boss",
      SECRETARY: "Secretary",
      CAPOREGIME: "Caporegime",
      SOLDIER: "Soldier",
    });
  });

  it("uses 30s Fams' rank names instead", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_ID", "30s-fams");
    const { MEMBER_RANK_LABEL } = await import("@/lib/constants/labels");
    expect(MEMBER_RANK_LABEL).toEqual({
      BOSS: "OG",
      UNDER_BOSS: "Under OG",
      SECRETARY: "Hood President",
      CAPOREGIME: "Shot Caller",
      SOLDIER: "Hangaround",
    });
  });

  it("never touches the role labels — those stay identical across brands", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_ID", "30s-fams");
    const { APP_ROLE_LABEL } = await import("@/lib/constants/labels");
    expect(APP_ROLE_LABEL).toEqual({
      SUPER_ADMIN: "Super Admin",
      MEMBER: "Member",
    });
  });
});
