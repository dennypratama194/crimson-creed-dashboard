import { formatDateTime } from "@/lib/format";

export type TimelineEntry = {
  id: string;
  description: string;
  created_at: string;
};

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No history yet.</p>;
  }

  return (
    <ol className="flex flex-col">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <span
              aria-hidden
              className="mt-1 size-2.5 rounded-full bg-primary ring-4 ring-primary/15"
            />
            {index < entries.length - 1 ? (
              <span aria-hidden className="w-px flex-1 bg-border" />
            ) : null}
          </div>
          <div className="flex flex-col gap-0.5 pb-1">
            <p className="text-sm">{entry.description}</p>
            <time
              dateTime={entry.created_at}
              className="text-xs text-muted-foreground tabular-nums"
            >
              {formatDateTime(entry.created_at)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
