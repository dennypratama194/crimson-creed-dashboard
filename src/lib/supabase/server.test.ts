// @vitest-environment node
/**
 * One Supabase client per Server Component render — never per module, never
 * shared across requests — and cookie rotation still honours "remember me".
 * `react`'s `cache` is replaced with its two real behaviours (memoize inside a
 * render, call through outside one); see src/lib/db/render-dedupe.test.ts.
 */
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CookieToSet = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};
type Handlers = {
  getAll: () => unknown;
  setAll: (cookies: CookieToSet[]) => void;
};

const state = vi.hoisted(() => ({
  scope: null as null | Map<unknown, unknown>,
  built: [] as { handlers: Handlers }[],
  jar: new Map<string, string>(),
  set: [] as {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[],
  readOnly: false,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  cache:
    <R>(fn: () => R) =>
    (): R => {
      if (!state.scope) return fn();
      if (!state.scope.has(fn)) state.scope.set(fn, fn());
      return state.scope.get(fn) as R;
    },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...state.jar].map(([name, value]) => ({ name, value })),
    get: (name: string) =>
      state.jar.has(name) ? { name, value: state.jar.get(name) } : undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      if (state.readOnly) throw new Error("read-only in a render");
      state.set.push({ name, value, options });
    },
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: Handlers },
  ) => {
    const client = { handlers: opts.cookies };
    state.built.push(client);
    return client;
  },
}));

async function render<T>(body: () => Promise<T>): Promise<T> {
  state.scope = new Map();
  try {
    return await body();
  } finally {
    state.scope = null;
  }
}

beforeEach(() => {
  state.scope = null;
  state.built.length = 0;
  state.jar.clear();
  state.set.length = 0;
  state.readOnly = false;
});

describe("createClient", () => {
  it("builds one client for a whole render", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    const [a, b, c] = await render(() =>
      Promise.all([createClient(), createClient(), createClient()]),
    );
    expect(state.built).toHaveLength(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("never shares a client between two renders (two requests)", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    const first = await render(() => createClient());
    const second = await render(() => createClient());
    expect(first).not.toBe(second);
    expect(state.built).toHaveLength(2);
  });

  it("outside a render (action, route handler) every call is a fresh client", async () => {
    const { createClient, createRequestClient } =
      await import("@/lib/supabase/server");
    await createClient();
    await createClient();
    await createRequestClient();
    expect(state.built).toHaveLength(3);
  });

  it("createRequestClient is never memoized, even inside a render", async () => {
    const { createRequestClient } = await import("@/lib/supabase/server");
    await render(() =>
      Promise.all([createRequestClient(), createRequestClient()]),
    );
    expect(state.built).toHaveLength(2);
  });
});

describe("cookie rotation", () => {
  const rotated: CookieToSet[] = [
    { name: "sb-token", value: "new", options: { maxAge: 34_560_000 } },
  ];

  it("writes rotated cookies with their lifetime when remember-me is on", async () => {
    const { createRequestClient } = await import("@/lib/supabase/server");
    const client = (await createRequestClient()) as unknown as {
      handlers: Handlers;
    };
    client.handlers.setAll(rotated);
    expect(state.set).toEqual([
      { name: "sb-token", value: "new", options: { maxAge: 34_560_000 } },
    ]);
  });

  it("downgrades them to session cookies when remember-me is off", async () => {
    state.jar.set("cc-remember", "0");
    const { createRequestClient } = await import("@/lib/supabase/server");
    const client = (await createRequestClient()) as unknown as {
      handlers: Handlers;
    };
    client.handlers.setAll(rotated);
    expect(state.set[0]?.options).not.toHaveProperty("maxAge");
  });

  it("a render's read-only cookie store does not throw", async () => {
    state.readOnly = true;
    const { createClient } = await import("@/lib/supabase/server");
    const client = (await render(() => createClient())) as unknown as {
      handlers: Handlers;
    };
    expect(() => client.handlers.setAll(rotated)).not.toThrow();
  });
});
