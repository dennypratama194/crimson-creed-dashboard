import { NextResponse, type NextRequest } from "next/server";

import { authorizeSuperAdmin } from "@/lib/auth/session";
import { listAvailableItemsForSupplier } from "@/lib/db/suppliers";
import { createRequestClient } from "@/lib/supabase/server";
import { supplierPickerQuerySchema } from "@/lib/validation/supplier";

/** Supplier costs are Super Admin data: never stored by a shared cache. */
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * One page of the Add item picker for a supplier — loaded when the dialog
 * opens, not with the page. Super Admin only; the RPC re-checks that and RLS
 * hides items and supplier listings from members regardless.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/admin/suppliers/[id]/available-items">,
) {
  const { id } = await ctx.params;
  const parsed = supplierPickerQuerySchema.safeParse({
    supplierId: id,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    page: request.nextUrl.searchParams.get("page") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid" },
      { status: 400, headers: NO_STORE },
    );
  }

  // One client for the auth check and the read.
  const supabase = await createRequestClient();
  try {
    const auth = await authorizeSuperAdmin(supabase);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.status === 401 ? "unauthenticated" : "forbidden" },
        { status: auth.status, headers: NO_STORE },
      );
    }

    const result = await listAvailableItemsForSupplier(
      parsed.data.supplierId,
      { search: parsed.data.q, page: parsed.data.page },
      supabase,
    );
    return NextResponse.json(result, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
