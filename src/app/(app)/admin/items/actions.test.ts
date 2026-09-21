// @vitest-environment node
/**
 * Cache invalidation for the member-facing catalogue. `getOrderableItems` is
 * `unstable_cache`d, so every write that can change what `/orders/new` lists —
 * create, edit, archive, restore, delete — has to expire the cache tag, and a
 * refused write has to leave it alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveItemAction,
  createItemAction,
  deleteItemAction,
  getItemDeleteImpactAction,
  restoreItemAction,
  updateItemAction,
} from "@/app/(app)/admin/items/actions";
import { ITEM_CATEGORIES, ITEM_UNITS } from "@/lib/constants/enums";
import { ORDERABLE_ITEMS_CACHE_TAG } from "@/lib/db/orders";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireSuperAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/auth/session", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
  unstable_cache: <T>(fn: T) => fn,
}));

const ITEM = "7a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";

function itemForm() {
  const form = new FormData();
  form.set("id", ITEM);
  form.set("name", "Lockpick");
  form.set("stockType", "CATALOGUE");
  form.set("category", ITEM_CATEGORIES[0]);
  form.set("unit", ITEM_UNITS[0]);
  form.set("price", "25");
  form.set("lowStockThreshold", "0");
  form.set("orderable", "on");
  form.set("active", "on");
  return form;
}

const writes = [
  {
    name: "createItemAction",
    run: () => createItemAction({ ok: false }, itemForm()),
  },
  {
    name: "updateItemAction",
    run: () => updateItemAction({ ok: false }, itemForm()),
  },
  { name: "archiveItemAction", run: () => archiveItemAction(ITEM) },
  { name: "restoreItemAction", run: () => restoreItemAction(ITEM) },
  { name: "deleteItemAction", run: () => deleteItemAction(ITEM) },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireSuperAdmin.mockResolvedValue({ id: "admin-1" });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

describe.each(writes)("$name", ({ run }) => {
  it("expires the orderable-items cache immediately after a successful write", async () => {
    await expect(run()).resolves.toMatchObject({ ok: true });
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      ORDERABLE_ITEMS_CACHE_TAG,
      {
        expire: 0,
      },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/items");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/inventory");
  });

  it("leaves the cache alone when the database refuses the write", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "refused", code: "P0001" },
    });
    await expect(run()).resolves.toMatchObject({ ok: false });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("requires a Super Admin before touching the database or the cache", async () => {
    mocks.requireSuperAdmin.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});

describe("getItemDeleteImpactAction", () => {
  it("is a read: it never invalidates the catalogue", async () => {
    await getItemDeleteImpactAction(ITEM);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
