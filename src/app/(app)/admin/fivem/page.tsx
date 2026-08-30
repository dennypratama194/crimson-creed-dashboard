import type { Metadata } from "next";

import { getServerSnapshot } from "@/lib/services/fivem";
import { PageHeader } from "@/components/patterns/page-header";
import { FivemMonitor } from "@/app/(app)/admin/fivem/fivem-monitor";

export const metadata: Metadata = { title: "FiveM server" };

// Always render fresh — this page is a live view of an external server.
export const dynamic = "force-dynamic";

export default async function AdminFivemPage() {
  const initialSnapshot = await getServerSnapshot();

  return (
    <>
      <PageHeader
        title="FiveM server"
        description="Live player list for the roleplay server, polled from the Cfx.re master list."
      />
      <FivemMonitor initialSnapshot={initialSnapshot} />
    </>
  );
}
