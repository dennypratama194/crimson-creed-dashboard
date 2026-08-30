import { PageHeader } from "@/components/patterns/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingAdminSubmissions() {
  return (
    <>
      <PageHeader
        title="Monthly submissions"
        description="What each member handed in — metal scrap, empty bottles and cans."
      />
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className="mx-4 my-3 h-6"
              style={{ width: `${60 + ((i * 9) % 30)}%` }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
