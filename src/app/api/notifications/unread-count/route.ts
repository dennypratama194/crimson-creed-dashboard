import { NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/db/notifications";
import { createRequestClient } from "@/lib/supabase/server";

/**
 * The count is per recipient, so the response must never be stored by a shared
 * cache: `private, no-store` on every outcome, including errors.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  // One client for the whole poll: React does not memoize in a Route Handler,
  // so the session check and the count would otherwise build one each.
  const supabase = await createRequestClient();

  // Don't run a DB query for callers with no session. The bell treats any
  // non-OK response as "keep the current count" and backs off.
  const userId = await getSessionUserId(supabase);
  if (!userId) {
    return NextResponse.json(
      { error: "unauthenticated" },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const count = await countUnreadNotifications(supabase);
    return NextResponse.json({ count }, { headers: NO_STORE });
  } catch {
    // Not `{ count: 0 }`: that would clear a real badge during an outage.
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
