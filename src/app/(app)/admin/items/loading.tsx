import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingItems() {
  return (
    <>
      <PageHeader
        title="Item catalogue"
        description="Categories, prices, and what members can order."
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 8 }).map((_, i) => (
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
