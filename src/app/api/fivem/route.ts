import { NextResponse, type NextRequest } from "next/server";

import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerSnapshot, probeServer } from "@/lib/services/fivem";

export const dynamic = "force-dynamic";

/** Live FiveM server snapshot. Super Admin only — mirrors the /admin guard. */
export async function GET(request: NextRequest) {
  await requireSuperAdmin();

  // Diagnostic: /api/fivem?debug=1 returns the raw per-endpoint probe so the
  // failure is visible in the browser without relying on platform logs.
  if (request.nextUrl.searchParams.get("debug") === "1") {
    const probe = await probeServer();
    return NextResponse.json(probe, {
      headers: { "cache-control": "no-store" },
    });
  }

  const snapshot = await getServerSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "cache-control": "no-store" },
  });
}
