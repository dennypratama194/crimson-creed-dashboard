import { NextResponse } from "next/server";

import { getUser } from "@/lib/auth/session";
import { getUnreadNotificationCount } from "@/lib/db/notifications";

export async function GET() {
  // Don't run a DB query for callers with no session. The bell treats a
  // non-OK response as "keep the current count", so 401 here is harmless.
  const user = await getUser();
  if (!user) return NextResponse.json({ count: 0 }, { status: 401 });

  try {
    const count = await getUnreadNotificationCount();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}
