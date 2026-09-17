// @vitest-environment node
/**
 * The inactive-member loop: requireActiveMember used to send a still-signed-in
 * inactive member to /login, the proxy sent any valid session from /login to
 * /dashboard, and the (app) guard sent it back to /login. These tests pin every
 * hop of the replacement flow.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { accountState } from "@/lib/auth/account-state";
import { isPublicPath, routeDecision } from "@/lib/auth/route-guard";
import {
  createFakeSupabase,
  uuid,
  type FakeOptions,
} from "@/lib/db/test-support/fake-postgrest";

const state = vi.hoisted(() => ({ fake: null as null | { client: unknown } }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.fake!.client,
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("@/lib/auth/actions", () => ({ signOut: async () => undefined }));

const USER = { id: uuid(1) };
const member = (status: "ACTIVE" | "INACTIVE") => ({
  id: uuid(2),
  user_id: USER.id,
  status,
  role: "MEMBER",
  display_name: "Crew",
});

function installFake(options: FakeOptions) {
  state.fake = createFakeSupabase(options);
}

const signedOut = () => installFake({ user: null });
const active = () =>
  installFake({ user: USER, tables: { members: [member("ACTIVE")] } });
const inactive = () =>
  installFake({ user: USER, tables: { members: [member("INACTIVE")] } });
const noMember = () => installFake({ user: USER, tables: { members: [] } });

beforeEach(() => {
  vi.resetModules();
  state.fake = null;
});

describe("accountState", () => {
  it("distinguishes all four cases", () => {
    expect(accountState(false, null).kind).toBe("signed-out");
    expect(accountState(true, null).kind).toBe("no-member");
    expect(accountState(true, { status: "INACTIVE" }).kind).toBe("inactive");
    expect(accountState(true, { status: "ACTIVE" }).kind).toBe("active");
  });
});

describe("requireActiveMember", () => {
  it("signed out -> /login", async () => {
    signedOut();
    const { requireActiveMember } = await import("@/lib/auth/session");
    await expect(requireActiveMember()).rejects.toThrow("REDIRECT /login");
  });

  it("active -> the member", async () => {
    active();
    const { requireActiveMember } = await import("@/lib/auth/session");
    await expect(requireActiveMember()).resolves.toMatchObject({
      status: "ACTIVE",
    });
  });

  it.each([
    ["inactive", inactive],
    ["no member row", noMember],
  ])("%s -> /account-unavailable, never /login", async (_label, setup) => {
    setup();
    const { requireActiveMember } = await import("@/lib/auth/session");
    await expect(requireActiveMember()).rejects.toThrow(
      "REDIRECT /account-unavailable",
    );
  });

  it("a failed member lookup throws instead of redirecting", async () => {
    installFake({
      user: USER,
      failTables: { members: { message: "timeout", code: "57014" } },
    });
    const { requireActiveMember } = await import("@/lib/auth/session");
    await expect(requireActiveMember()).rejects.toMatchObject({
      code: "57014",
    });
  });
});

describe("the proxy never bounces an unusable session in a loop", () => {
  it("/account-unavailable is reachable signed in, and not public", () => {
    expect(isPublicPath("/account-unavailable")).toBe(false);
    expect(routeDecision(true, "/account-unavailable")).toEqual({
      action: "next",
    });
    expect(routeDecision(false, "/account-unavailable")).toMatchObject({
      action: "redirect",
      pathname: "/login",
    });
  });

  it("keeps the signed-in / signed-out boundary", () => {
    expect(routeDecision(true, "/login")).toEqual({
      action: "redirect",
      pathname: "/dashboard",
    });
    expect(routeDecision(false, "/orders")).toEqual({
      action: "redirect",
      pathname: "/login",
      next: "/orders",
    });
    expect(routeDecision(false, "/")).toEqual({
      action: "redirect",
      pathname: "/login",
      next: undefined,
    });
    expect(routeDecision(false, "/login")).toEqual({ action: "next" });
  });

  it.each([
    ["inactive", inactive],
    ["no member row", noMember],
  ])(
    "%s: guard -> unavailable page -> renders (terminates)",
    async (_label, setup) => {
      setup();
      const seen: string[] = [];
      let path = "/dashboard";
      const { requireActiveMember } = await import("@/lib/auth/session");
      const { default: Page } =
        await import("@/app/(auth)/account-unavailable/page");
      for (let hop = 0; hop < 5; hop += 1) {
        seen.push(path);
        const decision = routeDecision(true, path);
        if (decision.action === "redirect") {
          path = decision.pathname;
          continue;
        }
        try {
          if (path === "/account-unavailable") {
            const element = await Page();
            expect(element).toBeTruthy();
            break;
          }
          await requireActiveMember();
          throw new Error("guard let an unusable session through");
        } catch (err) {
          const m = /^REDIRECT (\S+)/.exec((err as Error).message);
          if (!m) throw err;
          path = m[1]!;
        }
      }
      expect(seen).toEqual(["/dashboard", "/account-unavailable"]);
    },
  );

  it("the unavailable page sends an active member back and a signed-out user to login", async () => {
    active();
    let { default: Page } =
      await import("@/app/(auth)/account-unavailable/page");
    await expect(Page()).rejects.toThrow("REDIRECT /dashboard");

    vi.resetModules();
    signedOut();
    ({ default: Page } = await import("@/app/(auth)/account-unavailable/page"));
    await expect(Page()).rejects.toThrow("REDIRECT /login");
  });
});
