import { NextResponse, type NextRequest } from "next/server";

import { authorizeSuperAdmin } from "@/lib/auth/session";
import { getServerSnapshot, probeServer } from "@/lib/services/fivem";
import { createRequestClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Live FiveM server snapshot. Super Admin only — mirrors the /admin guard, and
 * runs BEFORE the warm-instance snapshot cache is consulted: a cached snapshot
 * needs no database read, so nothing downstream would refuse a non-admin.
 */
export async function GET(request: NextRequest) {
  // One client for the auth check and (on a cache miss) the uplink lookup.
  const supabase = await createRequestClient();

  let auth: Awaited<ReturnType<typeof authorizeSuperAdmin>>;
  try {
    auth = await authorizeSuperAdmin(supabase);
  } catch {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? "unauthenticated" : "forbidden" },
      { status: auth.status, headers: NO_STORE },
    );
  }

  // Diagnostic: /api/fivem?debug=1 returns the raw per-endpoint probe so the
  // failure is visible in the browser without relying on platform logs.
  if (request.nextUrl.searchParams.get("debug") === "1") {
    const probe = await probeServer(supabase);
    return NextResponse.json(probe, { headers: NO_STORE });
  }

  const snapshot = await getServerSnapshot({ supabase });
  return NextResponse.json(snapshot, { headers: NO_STORE });
}
