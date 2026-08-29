import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerSnapshot } from "@/lib/services/fivem";

export const dynamic = "force-dynamic";

/** Live FiveM server snapshot. Super Admin only — mirrors the /admin guard. */
export async function GET() {
  await requireSuperAdmin();
  const snapshot = await getServerSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "cache-control": "no-store" },
  });
}
