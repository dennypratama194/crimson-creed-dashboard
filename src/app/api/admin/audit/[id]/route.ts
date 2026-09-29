import { NextResponse, type NextRequest } from "next/server";

import { authorizeSuperAdmin } from "@/lib/auth/session";
import { getAuditDetail } from "@/lib/db/activity";
import { createRequestClient } from "@/lib/supabase/server";
import { auditEntryIdSchema } from "@/lib/validation/audit";

/** Audit snapshots are Super Admin data: never stored by a shared cache. */
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * One audit entry's before/after values, read when its View dialog opens so
 * the audit page itself never carries them. GET only — the audit log stays
 * append-only. Super Admin only; RLS on `audit_logs` enforces the same.
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/admin/audit/[id]">,
) {
  const { id } = await ctx.params;
  const parsed = auditEntryIdSchema.safeParse(id);
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

    const detail = await getAuditDetail(parsed.data, supabase);
    if (!detail) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
