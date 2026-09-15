import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingProduction() {
  return (
    <>
      <PageHeader
        title="Production"
        description="Jobs a Super Admin has put you in charge of. This view is read-only."
      />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-72" />
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
    </>
  );
}
