import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingProduction() {
  return (
    <>
      <PageHeader
        title="Production"
        description="Log what you process. Pay is piece-rate — set by a Super Admin per product."
      />
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-9 w-64" />
          <div className="overflow-hidden rounded-xl border border-border">
            <Skeleton className="h-10 w-full rounded-none" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="mx-4 my-3 h-6"
                style={{ width: `${70 + ((i * 7) % 25)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
