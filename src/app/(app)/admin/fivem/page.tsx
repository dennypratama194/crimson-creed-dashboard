import type { Metadata } from "next";
import { Suspense } from "react";

import { requireSuperAdmin } from "@/lib/auth/session";
import { getServerSnapshot } from "@/lib/services/fivem";
import { PageHeader } from "@/components/patterns/page-header";
import { FivemMonitor } from "@/app/(app)/admin/fivem/fivem-monitor";
import { FivemSkeleton } from "@/app/(app)/admin/fivem/fivem-skeleton";

export const metadata: Metadata = { title: "FiveM server" };

// Always render fresh — this page is a live view of an external server.
export const dynamic = "force-dynamic";

/**
 * The snapshot can take seconds on a cache miss (an upstream that ignores us
 * costs its full timeout), so it streams in behind a skeleton instead of
 * holding back the whole page.
 */
async function LiveMonitor() {
  const initialSnapshot = await getServerSnapshot();
  return <FivemMonitor initialSnapshot={initialSnapshot} />;
}

export default async function AdminFivemPage() {
  // The admin layout guards this route too, but a page renders alongside its
  // layout, not after it — and a cached snapshot needs no RLS-checked read.
  // Authorize before touching it (memoized: the layout's check is reused).
  await requireSuperAdmin();

  return (
    <>
      <PageHeader
        title="FiveM server"
        description="Live player list for the roleplay server, polled from its public endpoints."
      />
      <Suspense fallback={<FivemSkeleton />}>
        <LiveMonitor />
      </Suspense>
    </>
  );
}
