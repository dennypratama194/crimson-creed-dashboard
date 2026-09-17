import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth/session";
import { getUnreadNotificationCount } from "@/lib/db/notifications";

/**
 * The count is per recipient, so the response must never be stored by a shared
 * cache: `private, no-store` on every outcome, including errors.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  // Don't run a DB query for callers with no session. The bell treats any
  // non-OK response as "keep the current count".
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const count = await getUnreadNotificationCount();
    return NextResponse.json({ count }, { headers: NO_STORE });
  } catch {
    // Not `{ count: 0 }`: that would clear a real badge during an outage.
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
