import type { Metadata } from "next";
import { Activity } from "lucide-react";

import { listActivity } from "@/lib/db/activity";
import { clampPage } from "@/lib/db/paging";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { Pagination } from "@/components/patterns/pagination";

export const metadata: Metadata = { title: "Activity" };

export default async function AdminActivityPage({
  searchParams,
}: PageProps<"/admin/activity">) {
  const sp = await searchParams;
  const page = clampPage(Array.isArray(sp.page) ? sp.page[0] : sp.page);

  const { rows, total, pageSize } = await listActivity({ page });

  return (
    <>
      <PageHeader
        title="Activity"
        description="A readable feed of everything that happens in the system, kept for 90 days."
      />

      {rows.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing here yet" />
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {rows.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-4 px-4 py-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">{entry.summary}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.actor_name ?? "System"} ·{" "}
                    <span className="font-mono">{entry.verb}</span>
                  </span>
                </div>
                <time
                  dateTime={entry.created_at}
                  className="shrink-0 text-xs text-muted-foreground tabular-nums"
                >
                  {formatDateTime(entry.created_at)}
                </time>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={pageSize} total={total} />
        </div>
      )}
    </>
  );
}
